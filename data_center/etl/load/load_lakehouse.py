# -*- coding: utf-8 -*-
"""
Module: load_lakehouse.py
Mục đích: Nạp và đồng bộ dữ liệu tầng Gold vào bảng Delta Lakehouse có hỗ trợ ACID và Time Travel.
"""

import sys
import time
from pathlib import Path

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parents[3]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from data_center.data_lake.lakehouse_manager import init_or_sync_lakehouse, get_lakehouse_history


def main():
    print("=" * 80)
    print("NẠP DỮ LIỆU TẦNG GOLD VÀO DATA LAKEHOUSE (DELTA LAKE)")
    print("=" * 80)
    start_time = time.time()
    
    info = init_or_sync_lakehouse(mode="overwrite")
    duration = time.time() - start_time
    
    print(f"[*] Đồng bộ thành công vào bảng Delta: {info['table_path']}")
    print(f"[*] Phiên bản Delta: {info['version']}")
    print(f"[*] Số dòng: {info['num_rows']:,}")
    print(f"[*] Tổng sản lượng bảo toàn: {info['total_quantity']:,}")
    print(f"[*] Thời gian nạp Lakehouse: {duration:.2f} giây")
    print("=" * 80)


if __name__ == "__main__":
    main()
