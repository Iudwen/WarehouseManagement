# -*- coding: utf-8 -*-
"""
Module: lakehouse_manager.py
Mục đích: Nâng cấp một phần Data Lake Gold thành Data Lakehouse sử dụng Delta Lake (Delta-RS).
"""

import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd
from deltalake import DeltaTable, write_deltalake

# Thiết lập đường dẫn
BASE_DIR = Path(__file__).resolve().parents[2]
GOLD_CSV_FILE = BASE_DIR / "data_center" / "data_lake" / "gold" / "lich_su_xuat_hang_gold.csv"
LAKEHOUSE_DIR = BASE_DIR / "data_center" / "data_lake" / "gold" / "lakehouse"
DELTA_TABLE_PATH = LAKEHOUSE_DIR / "lich_su_xuat_hang_delta"


def init_or_sync_lakehouse(mode: str = "overwrite") -> Dict[str, Any]:
    """
    Nạp dữ liệu từ file Gold CSV vào bảng Delta Lakehouse.
    Mode:
    - 'overwrite': Tạo snapshot/phiên bản mới thay thế toàn bộ dữ liệu hiện tại một cách an toàn qua ACID commit.
    - 'append': Nạp nối tiếp dữ liệu mới.
    """
    if not GOLD_CSV_FILE.exists():
        raise FileNotFoundError(f"Gold CSV not found at: {GOLD_CSV_FILE}")

    # Đọc dữ liệu Gold gốc
    df = pd.read_csv(GOLD_CSV_FILE, encoding="utf-8")
    
    # Ép kiểu chuẩn mực cho schema
    df["ngay"] = df["ngay"].astype(str)
    df["ma_kho"] = df["ma_kho"].astype(str)
    df["ma_sp"] = df["ma_sp"].astype(str)
    df["so_phieu_xuat"] = df["so_phieu_xuat"].astype(int)
    df["tong_so_luong_xuat"] = df["tong_so_luong_xuat"].astype(int)
    df["tong_gia_tri_xuat"] = df["tong_gia_tri_xuat"].astype(float)

    LAKEHOUSE_DIR.mkdir(parents=True, exist_ok=True)

    # Ghi dữ liệu vào Delta Table (Delta-RS tạo commit log trong _delta_log/*.json)
    write_deltalake(
        table_or_uri=str(DELTA_TABLE_PATH),
        data=df,
        mode=mode
    )

    dt = DeltaTable(str(DELTA_TABLE_PATH))
    current_version = dt.version()
    
    result = {
        "table_path": str(DELTA_TABLE_PATH),
        "version": current_version,
        "mode": mode,
        "num_rows": len(df),
        "total_quantity": int(df["tong_so_luong_xuat"].sum()),
        "columns": list(df.columns),
        "timestamp": datetime.now().isoformat()
    }
    return result


def query_lakehouse(version: Optional[int] = None) -> pd.DataFrame:
    """
    Truy vấn bảng Delta Lakehouse có hỗ trợ Time Travel thực sự:
    - version: Số phiên bản cụ thể (ví dụ: version=0, version=1).
    """
    if not DELTA_TABLE_PATH.exists():
        raise FileNotFoundError(f"Delta table not found at: {DELTA_TABLE_PATH}")

    if version is not None:
        dt = DeltaTable(str(DELTA_TABLE_PATH), version=version)
    else:
        dt = DeltaTable(str(DELTA_TABLE_PATH))

    return dt.to_pandas()


def get_lakehouse_history() -> List[Dict[str, Any]]:
    """
    Truy xuất toàn bộ lịch sử commit trong transaction log của bảng Delta.
    """
    if not DELTA_TABLE_PATH.exists():
        return []
    dt = DeltaTable(str(DELTA_TABLE_PATH))
    history = dt.history()
    return history


def apply_controlled_test_change() -> Tuple[int, int, Dict[str, Any]]:
    """
    Thực hiện một thay đổi kiểm thử có kiểm soát (Append batch kiểm thử) để tạo phiên bản mới (V_next).
    Trả về (old_version, new_version, test_record).
    """
    dt_before = DeltaTable(str(DELTA_TABLE_PATH))
    old_version = dt_before.version()

    # Tạo batch dữ liệu kiểm thử có kiểm soát
    test_df = pd.DataFrame([{
        "ngay": "2026-09-19",
        "ma_kho": "HN01",
        "ma_sp": "SP001",
        "so_phieu_xuat": 1,
        "tong_so_luong_xuat": 50,
        "tong_gia_tri_xuat": 471133100.0
    }])

    # Ghi batch mới bằng mode append (sinh version mới qua ACID transaction)
    write_deltalake(
        table_or_uri=str(DELTA_TABLE_PATH),
        data=test_df,
        mode="append"
    )

    dt_after = DeltaTable(str(DELTA_TABLE_PATH))
    new_version = dt_after.version()

    return old_version, new_version, test_df.iloc[0].to_dict()


if __name__ == "__main__":
    print("[*] Initializing / Syncing Delta Lakehouse from Gold CSV...")
    info = init_or_sync_lakehouse(mode="overwrite")
    print(f"[OK] Delta Table created at: {info['table_path']}")
    print(f"Current version: {info['version']} | Rows: {info['num_rows']} | Total qty: {info['total_quantity']}")
    
    print("\n[*] Delta Transaction Log History:")
    hist = get_lakehouse_history()
    for commit in hist[:5]:
        ts = commit.get("timestamp")
        time_str = datetime.fromtimestamp(ts/1000).strftime('%Y-%m-%d %H:%M:%S') if ts else 'N/A'
        print(f"  - Version {commit.get('version')}: {commit.get('operation')} at {time_str}")
