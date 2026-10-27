import json
import os
import sys
from datetime import datetime
from pathlib import Path
import psycopg
import numpy as np
import pandas as pd
from dotenv import load_dotenv

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]

# Đường dẫn dữ liệu đầu vào
TON_KHO_FILE = BASE_DIR / "data_center" / "data_lake" / "silver" / "postgresql" / "central" / "ton_kho_central.csv"
WEEKLY_FORECAST_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "weekly_next_forecast.csv"
WEEKLY_FORECAST_STATUS_FILE = (
    BASE_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "weekly_live_forecast_status.json"
)
MAX_SOURCE_AGE_DAYS = 7
ABC_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "abc_xyz_analysis.json"
SP_FILE = BASE_DIR / "data_center" / "data_lake" / "silver" / "postgresql" / "central" / "san_pham.csv"

# Đường dẫn file đầu ra
GOLD_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
OUTPUT_JSON_DM = GOLD_DIR / "transfer_recommendations.json"
OUTPUT_CSV_DM = GOLD_DIR / "transfer_recommendations.csv"

DATA_LAKE_GOLD_DIR = BASE_DIR / "data_center" / "data_lake" / "gold"
OUTPUT_JSON_DL = DATA_LAKE_GOLD_DIR / "transfer_recommendations.json"
OUTPUT_CSV_DL = DATA_LAKE_GOLD_DIR / "transfer_recommendations.csv"

EMPTY_RECOMMENDATION_COLUMNS = [
    "id",
    "ma_sp",
    "kho_nguon",
    "kho_dich",
    "so_luong_de_xuat",
    "gia_tri_uoc_tinh",
    "priority_code",
]

NODE_DATABASES = {
    "HN": {
        "host_env": "POSTGRES_HOST_HN",
        "port_env": "POSTGRES_PORT_HN",
        "database_env": "POSTGRES_DB_HN",
        "default_port": 5433,
    },
    "DN": {
        "host_env": "POSTGRES_HOST_DN",
        "port_env": "POSTGRES_PORT_DN",
        "database_env": "POSTGRES_DB_DN",
        "default_port": 5434,
    },
    "HCM": {
        "host_env": "POSTGRES_HOST_HCM",
        "port_env": "POSTGRES_PORT_HCM",
        "database_env": "POSTGRES_DB_HCM",
        "default_port": 5435,
    },
}


def persist_recommendations(summary_result, target_warehouse_filter):
    GOLD_DIR.mkdir(parents=True, exist_ok=True)
    DATA_LAKE_GOLD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = (
        f"_{target_warehouse_filter}"
        if target_warehouse_filter and target_warehouse_filter != "ALL"
        else ""
    )
    target_json_dm = GOLD_DIR / f"transfer_recommendations{suffix}.json"
    target_json_dl = DATA_LAKE_GOLD_DIR / f"transfer_recommendations{suffix}.json"
    target_csv_dm = GOLD_DIR / f"transfer_recommendations{suffix}.csv"
    target_csv_dl = DATA_LAKE_GOLD_DIR / f"transfer_recommendations{suffix}.csv"

    json_str = json.dumps(summary_result, ensure_ascii=False, indent=2)
    target_json_dm.write_text(json_str, encoding="utf-8")
    target_json_dl.write_text(json_str, encoding="utf-8")

    items = summary_result.get("items", [])
    output = (
        pd.DataFrame(items)
        if items
        else pd.DataFrame(columns=EMPTY_RECOMMENDATION_COLUMNS)
    )
    output.to_csv(target_csv_dm, index=False, encoding="utf-8-sig")
    output.to_csv(target_csv_dl, index=False, encoding="utf-8-sig")
    return target_json_dm, target_json_dl


def fetch_approved_export_commitments():
    """Fetch approved, not-yet-shipped export quantities from every warehouse node."""
    load_dotenv(BASE_DIR / ".env", override=False)
    commitments = []

    for node, config in NODE_DATABASES.items():
        connection_config = {
            "host": os.getenv(config["host_env"], "127.0.0.1"),
            "port": int(os.getenv(config["port_env"], str(config["default_port"]))),
            "dbname": os.getenv(config["database_env"], f"warehouse_{node.lower()}"),
            "user": os.getenv("POSTGRES_USER", "admin"),
            "password": os.getenv("POSTGRES_PASSWORD", ""),
            "connect_timeout": 10,
            "application_name": "warehouse_transfer_commitment_extract",
        }
        with psycopg.connect(**connection_config) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        BTRIM(px.ma_kho) AS ma_kho,
                        BTRIM(ct.ma_sp) AS ma_sp,
                        SUM(ct.so_luong) AS so_luong_da_duyet_chua_xuat
                    FROM phieu_xuat px
                    JOIN ct_phieu_xuat ct
                      ON ct.ma_phieu_xuat = px.ma_phieu_xuat
                    WHERE px.trang_thai = 'DA_DUYET'
                    GROUP BY BTRIM(px.ma_kho), BTRIM(ct.ma_sp)
                    """
                )
                commitments.extend(cursor.fetchall())

    result = pd.DataFrame(
        commitments,
        columns=["ma_kho", "ma_sp", "so_luong_da_duyet_chua_xuat"],
    )
    if result.empty:
        return result

    result["so_luong_da_duyet_chua_xuat"] = pd.to_numeric(
        result["so_luong_da_duyet_chua_xuat"],
        errors="raise",
    )
    if (
        not np.isfinite(result["so_luong_da_duyet_chua_xuat"]).all()
        or (result["so_luong_da_duyet_chua_xuat"] < 0).any()
    ):
        raise ValueError("Approved, unshipped export quantities must be finite and non-negative.")
    if result.duplicated(["ma_kho", "ma_sp"]).any():
        raise ValueError("Node databases returned duplicate warehouse-product commitments.")
    return result


def compute_transfer_pairs(merged_df, sp_info=None, abc_groups=None):
    """
    Thuật toán ghép cặp điều chuyển liên kho có theo dõi lượng thặng dư khả dụng động (Available Supply Pool).
    Đảm bảo:
    - Tổng lượng đề xuất lấy từ mỗi kho nguồn không vượt quá thặng dư ban đầu của kho đó.
    - Lượng đề xuất không âm và đạt mức tối thiểu >= 5.
    - Làm tròn theo bội số 5 để thuận tiện đóng gói nhưng không vượt quá lượng thặng dư còn lại.
    """
    if sp_info is None:
        sp_info = {}
    if abc_groups is None:
        abc_groups = {}

    recommendations = []
    pair_id = 1

    for sp_id, grp in merged_df.groupby("ma_sp"):
        deficits = grp[grp["surplus"] < 0].sort_values("surplus", ascending=True)
        surpluses = grp[grp["surplus"] > 0].sort_values("surplus", ascending=False)

        if len(deficits) == 0 or len(surpluses) == 0:
            continue

        # Khởi tạo pool theo dõi lượng thặng dư khả dụng động của từng kho nguồn
        available_pool = {sur_row["ma_kho"]: int(sur_row["surplus"]) for _, sur_row in surpluses.iterrows()}

        for _, def_row in deficits.iterrows():
            needed = abs(int(def_row["surplus"]))
            for _, sur_row in surpluses.iterrows():
                src_kho = sur_row["ma_kho"]
                available = available_pool.get(src_kho, 0)
                if available <= 0 or needed <= 0:
                    continue

                # Số lượng điều chuyển = min(lượng thiếu của kho đích, lượng dư khả dụng còn lại của kho nguồn)
                raw_transfer_qty = min(needed, available)
                if raw_transfer_qty < 5:
                    continue

                # Round down so the package multiple never exceeds source surplus or destination need.
                transfer_qty = int(raw_transfer_qty // 5 * 5)
                if transfer_qty <= 0:
                    continue

                sp_meta = sp_info.get(sp_id, {"ten_sp": sp_id, "gia_ban": 0, "don_vi": "Cái"})
                abc_meta = abc_groups.get(sp_id, {"nhom_abc": "B", "nhom_abc_xyz": "BX"})

                # Đánh giá mức độ ưu tiên
                dos_dich = float(def_row["dos"]) if "dos" in def_row else 0.0
                dos_nguon = float(sur_row["dos"]) if "dos" in sur_row else 0.0

                if abc_meta["nhom_abc"] == "A" or dos_dich < 7.0:
                    priority = "CAO (CRITICAL)"
                    priority_code = "HIGH"
                elif abc_meta["nhom_abc"] == "B" or dos_dich < 10.0:
                    priority = "TRUNG BÌNH (WARNING)"
                    priority_code = "MEDIUM"
                else:
                    priority = "TIÊU CHUẨN (INFO)"
                    priority_code = "LOW"

                target_stock_val = int(def_row["target_stock"]) if "target_stock" in def_row else 0
                rec = {
                    "id": f"REC_{pair_id:03d}",
                    "ma_sp": sp_id,
                    "ten_sp": sp_meta["ten_sp"],
                    "don_vi": sp_meta["don_vi"],
                    "nhom_abc_xyz": abc_meta["nhom_abc_xyz"],
                    "kho_nguon": src_kho,
                    "ton_kho_nguon": int(sur_row["so_luong"]),
                    "ton_kho_kha_dung_nguon": int(
                        sur_row.get("ton_kho_kha_dung", sur_row["so_luong"])
                    ),
                    "so_luong_da_duyet_chua_xuat_nguon": int(
                        sur_row.get("so_luong_da_duyet_chua_xuat", 0)
                    ),
                    "dos_kho_nguon": dos_nguon,
                    "kho_dich": def_row["ma_kho"],
                    "ton_kho_dich": int(def_row["so_luong"]),
                    "ton_kho_kha_dung_dich": int(
                        def_row.get("ton_kho_kha_dung", def_row["so_luong"])
                    ),
                    "so_luong_da_duyet_chua_xuat_dich": int(
                        def_row.get("so_luong_da_duyet_chua_xuat", 0)
                    ),
                    "dos_kho_dich": dos_dich,
                    "so_luong_de_xuat": transfer_qty,
                    "gia_tri_uoc_tinh": transfer_qty * sp_meta["gia_ban"],
                    "muc_do_uu_tien": priority,
                    "priority_code": priority_code,
                    "can_cu_de_xuat": (
                        f"Kho nhận {def_row['ma_kho']} có {int(def_row['so_luong'])} sp tồn kho, "
                        f"trong đó {int(def_row.get('so_luong_da_duyet_chua_xuat', 0))} sp đã cam kết "
                        f"xuất, còn {int(def_row.get('ton_kho_kha_dung', def_row['so_luong']))} sp khả dụng "
                        f"(đáp ứng {dos_dich:.1f} ngày xuất, thiếu {needed} sp so với định mức an toàn "
                        f"{target_stock_val} sp). Kho nguồn {src_kho} có {int(sur_row['so_luong'])} sp tồn kho, "
                        f"trong đó {int(sur_row.get('so_luong_da_duyet_chua_xuat', 0))} sp đã cam kết xuất, "
                        f"còn {available} sp khả dụng "
                        f"(đáp ứng {dos_nguon:.1f} ngày xuất). Đề xuất điều phối {transfer_qty} sp để cân bằng tồn kho, "
                        f"phòng ngừa nguy cơ đứt hàng."
                    ),
                    "ngay_tao": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                recommendations.append(rec)
                pair_id += 1

                # CẬP NHẬT TRỪ LƯỢNG ĐÃ ĐIỀU CHUYỂN
                needed -= transfer_qty
                available_pool[src_kho] -= transfer_qty

    return recommendations


def build_inventory_analysis(merged_df):
    analysis = []
    for row in merged_df.sort_values(["ma_kho", "ma_sp"]).to_dict("records"):
        surplus = int(row["surplus"])
        available = int(row["ton_kho_kha_dung"])
        demand_per_day = float(row["demand_per_day"])
        committed = int(row["so_luong_da_duyet_chua_xuat"])
        on_hand = int(row["so_luong"])
        overcommitted = max(committed - on_hand, 0)
        analysis.append({
            "ma_kho": row["ma_kho"],
            "ma_sp": row["ma_sp"],
            "ton_kho_hien_tai": on_hand,
            "so_luong_da_duyet_chua_xuat": committed,
            "ton_kho_kha_dung": available,
            "so_luong_cam_ket_vuot_ton": overcommitted,
            "du_bao_nhu_cau_tuan": round(
                float(row["demand_per_day"]) * 7,
                2,
            ),
            "nhu_cau_du_bao_ngay": round(demand_per_day, 2),
            "so_ngay_ton_an_toan": int(row["safety_days"]),
            "ton_muc_tieu": int(row["target_stock"]),
            "days_of_supply": (
                round(available / demand_per_day, 1)
                if demand_per_day > 0
                else None
            ),
            "trang_thai_ton": (
                "OVERCOMMITTED" if overcommitted > 0
                else "SHORTAGE" if surplus < 0
                else "SURPLUS" if surplus > 0
                else "AT_TARGET"
            ),
            "so_luong_can_bo_sung": max(-surplus, 0),
            "so_luong_du_co_the_dieu_chuyen": max(surplus, 0),
        })
    return analysis


def run_transfer_recommendations(target_warehouse_filter=None):
    """
    Sinh các đề xuất điều chuyển hàng liên kho (Decision Support System - DSS):
    - Đọc tồn kho hiện tại (ton_kho_central.csv)
    - Đọc dự báo tuần kế tiếp chỉ khi dữ liệu nguồn đạt freshness gate
    - Đọc phân loại giá trị & độ biến động (abc_xyz_analysis.json)
    - Xác định kho thiếu hụt (Deficit) và kho thặng dư (Surplus)
    - Ghép cặp tối ưu điều chuyển liên kho, tính lượng chuyển và lý do khoa học
    """
    wh_label = target_warehouse_filter if target_warehouse_filter and target_warehouse_filter != "ALL" else "TOÀN HỆ THỐNG"
    print("=" * 80)
    print(f"HỖ TRỢ QUYẾT ĐỊNH ĐIỀU CHUYỂN HÀNG LIÊN KHO ({wh_label})")
    print("=" * 80)

    if not WEEKLY_FORECAST_STATUS_FILE.exists():
        blocked_reason = (
            "Chưa có trạng thái dự báo tuần mới nhất. Hãy chạy pipeline dự báo; "
            "không sử dụng dự báo holdout lịch sử cho quyết định điều chuyển."
        )
        live_status = {}
    else:
        with WEEKLY_FORECAST_STATUS_FILE.open("r", encoding="utf-8") as f:
            live_status = json.load(f)
        if live_status.get("status") != "READY":
            blocked_reason = live_status.get("reason") or (
                "Dữ liệu nguồn chưa đủ mới hoặc chưa đủ điều kiện để tạo dự báo tuần."
            )
        else:
            source_age_days = live_status.get("source_age_days")
            if (
                not isinstance(source_age_days, (int, float))
                or not np.isfinite(source_age_days)
                or source_age_days < 0
            ):
                blocked_reason = "Trạng thái READY thiếu tuổi dữ liệu nguồn hợp lệ."
            elif source_age_days > MAX_SOURCE_AGE_DAYS:
                blocked_reason = (
                    f"Dữ liệu dự báo đã cũ {source_age_days} ngày "
                    f"(giới hạn {MAX_SOURCE_AGE_DAYS} ngày)."
                )
            else:
                blocked_reason = None

    if blocked_reason:
        summary_result = {
            "status": "BLOCKED_FORECAST_DATA",
            "forecast_source": str(WEEKLY_FORECAST_FILE.name),
            "kho_ap_dung": target_warehouse_filter or "ALL",
            "thoi_diem_tao": datetime.now().isoformat(),
            "tong_so_de_xuat": 0,
            "tong_gia_tri_uoc_tinh": 0,
            "phan_bo_muc_do": {"HIGH": 0, "MEDIUM": 0, "LOW": 0},
            "inventory_analysis_status": "BLOCKED_FORECAST_DATA",
            "inventory_analysis": [],
            "ghi_chu_nghiep_vu": (
                "Không tạo đề xuất điều chuyển vì chưa có dự báo tuần kế tiếp đủ tin cậy. "
                f"{blocked_reason} Dự báo holdout lịch sử không được dùng thay cho dự báo tương lai."
            ),
            "items": [],
        }
        persist_recommendations(summary_result, target_warehouse_filter)
        print(f"[*] Đã chặn đề xuất điều chuyển: {blocked_reason}")
        return summary_result

    if not WEEKLY_FORECAST_FILE.exists():
        raise FileNotFoundError(
            "Trạng thái dự báo tuần báo READY nhưng không tìm thấy "
            f"{WEEKLY_FORECAST_FILE}."
        )
    if not TON_KHO_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file tồn kho: {TON_KHO_FILE}")

    # 1. Đọc thông tin sản phẩm
    sp_info = {}
    if SP_FILE.exists():
        df_sp = pd.read_csv(SP_FILE)
        for _, r in df_sp.iterrows():
            sp_info[r["ma_sp"]] = {
                "ten_sp": r["ten_sp"],
                "gia_ban": float(r.get("gia_ban", 0)),
                "don_vi": r.get("don_vi_tinh", "Cái")
            }

    # 2. Đọc phân loại ABC-XYZ
    abc_groups = {}
    if ABC_FILE.exists():
        with ABC_FILE.open("r", encoding="utf-8") as f:
            abc_data = json.load(f)
            for item in abc_data.get("items", []):
                abc_groups[item["ma_sp"]] = {
                    "nhom_abc": item["nhom_abc"],
                    "nhom_xyz": item["nhom_xyz"],
                    "nhom_abc_xyz": item["nhom_abc_xyz"]
                }

    # 3. Đọc tồn kho và dự báo tuần kế tiếp
    df_ton = pd.read_csv(TON_KHO_FILE)
    df_fc = pd.read_csv(WEEKLY_FORECAST_FILE)
    required_stock_columns = {"ma_kho", "ma_sp", "so_luong"}
    missing_stock_columns = required_stock_columns - set(df_ton.columns)
    if missing_stock_columns:
        raise ValueError(
            "ton_kho_central.csv thiếu cột bắt buộc: "
            + ", ".join(sorted(missing_stock_columns))
        )
    df_ton["so_luong"] = pd.to_numeric(df_ton["so_luong"], errors="raise")
    if (
        not np.isfinite(df_ton["so_luong"]).all()
        or (df_ton["so_luong"] < 0).any()
    ):
        raise ValueError("Tồn kho phải là số hữu hạn và không âm.")
    if df_ton.duplicated(["ma_kho", "ma_sp"]).any():
        raise ValueError("ton_kho_central.csv có nhiều dòng cho một cặp kho-sản phẩm.")

    df_commitments = fetch_approved_export_commitments()
    if not df_commitments.empty:
        df_ton = df_ton.merge(
            df_commitments,
            on=["ma_kho", "ma_sp"],
            how="outer",
            indicator=True,
            validate="one_to_one",
        )
        unmatched_commitments = df_ton[df_ton["_merge"] == "right_only"]
        if not unmatched_commitments.empty:
            raise ValueError(
                "Approved export commitments reference warehouse-product pairs "
                "missing from central inventory."
            )
        df_ton = df_ton.drop(columns="_merge")
    else:
        df_ton["so_luong_da_duyet_chua_xuat"] = 0
    df_ton["so_luong_da_duyet_chua_xuat"] = (
        df_ton["so_luong_da_duyet_chua_xuat"].fillna(0)
    )
    df_ton["so_luong_kha_dung_rong"] = (
        df_ton["so_luong"] - df_ton["so_luong_da_duyet_chua_xuat"]
    )
    df_ton["ton_kho_kha_dung"] = df_ton["so_luong_kha_dung_rong"].clip(
        lower=0
    )

    required_forecast_columns = {
        "ma_kho",
        "ma_sp",
        "tuan_bat_dau",
        "tuan_ket_thuc",
        "du_bao_nhu_cau_tuan",
    }
    missing_forecast_columns = required_forecast_columns - set(df_fc.columns)
    if missing_forecast_columns:
        raise ValueError(
            "weekly_next_forecast.csv thiếu cột bắt buộc: "
            + ", ".join(sorted(missing_forecast_columns))
        )
    df_fc["du_bao_nhu_cau_tuan"] = pd.to_numeric(
        df_fc["du_bao_nhu_cau_tuan"], errors="raise"
    )
    if (
        not np.isfinite(df_fc["du_bao_nhu_cau_tuan"]).all()
        or (df_fc["du_bao_nhu_cau_tuan"] < 0).any()
    ):
        raise ValueError("Dự báo tuần phải là số hữu hạn và không âm.")
    if df_fc.duplicated(["ma_kho", "ma_sp"]).any():
        raise ValueError("Dự báo tuần có nhiều hơn một dòng cho mỗi cặp kho-sản phẩm.")
    if df_fc.empty:
        raise ValueError("Trạng thái dự báo READY nhưng weekly_next_forecast.csv rỗng.")
    df_fc["tuan_bat_dau"] = pd.to_datetime(
        df_fc["tuan_bat_dau"], errors="raise"
    ).dt.normalize()
    df_fc["tuan_ket_thuc"] = pd.to_datetime(
        df_fc["tuan_ket_thuc"], errors="raise"
    ).dt.normalize()
    if (
        df_fc["tuan_bat_dau"].nunique() != 1
        or df_fc["tuan_ket_thuc"].nunique() != 1
    ):
        raise ValueError("Dự báo tuần phải thống nhất một khoảng thời gian.")
    forecast_start = df_fc["tuan_bat_dau"].iloc[0]
    forecast_end = df_fc["tuan_ket_thuc"].iloc[0]
    if (
        forecast_start.weekday() != 0
        or (forecast_end - forecast_start).days != 6
        or forecast_start.date().isoformat() != live_status.get("forecast_start_week")
        or forecast_end.date().isoformat() != live_status.get("forecast_end_week")
    ):
        raise ValueError(
            "Khoảng ngày trong dự báo tuần không khớp trạng thái READY "
            "hoặc không phải tuần thứ Hai-Chủ Nhật hoàn chỉnh."
        )
    df_fc["tuan_bat_dau"] = df_fc["tuan_bat_dau"].dt.date.astype(str)
    df_fc["tuan_ket_thuc"] = df_fc["tuan_ket_thuc"].dt.date.astype(str)

    daily_fc = (
        df_fc[["ma_kho", "ma_sp", "du_bao_nhu_cau_tuan"]]
        .assign(
            demand_per_day=lambda frame: frame["du_bao_nhu_cau_tuan"] / 7.0
        )
        .drop(columns="du_bao_nhu_cau_tuan")
    )

    # Hợp nhất tồn kho và dự báo
    merged = pd.merge(
        df_ton,
        daily_fc,
        on=["ma_kho", "ma_sp"],
        how="outer",
        indicator=True,
        validate="one_to_one",
    )
    unmatched = merged[merged["_merge"] != "both"]
    if not unmatched.empty:
        raise ValueError(
            "Inventory and weekly forecast do not cover the same warehouse-product "
            f"pairs ({len(unmatched)} unmatched rows); refusing partial DSS results."
        )
    merged = merged.drop(columns="_merge")

    # Mức đệm an toàn theo nhóm ABC (Pareto)
    def get_safety_days(sp_id):
        grp = abc_groups.get(sp_id, {}).get("nhom_abc", "B")
        if grp == "A":
            return 14  # 14 ngày an toàn cho hàng giá trị cao (nhóm A)
        elif grp == "B":
            return 10  # 10 ngày cho nhóm B
        else:
            return 7   # 7 ngày cho nhóm C

    merged["safety_days"] = merged["ma_sp"].apply(get_safety_days)
    merged["target_stock"] = np.round(merged["demand_per_day"].clip(lower=0) * merged["safety_days"])
    
    # Xử lý an toàn tránh chia cho 0 khi nhu cầu dự báo bằng 0
    safe_demand = merged["demand_per_day"].replace(0, np.nan)
    merged["dos"] = np.where(
        safe_demand.isna(),
        np.where(merged["ton_kho_kha_dung"] > 0, 999.0, 0.0),
        np.round(merged["ton_kho_kha_dung"] / safe_demand, 1)
    )
    merged["surplus"] = (
        merged["so_luong_kha_dung_rong"] - merged["target_stock"]
    )

    # 4. Tìm các cặp điều chuyển liên kho
    recommendations = compute_transfer_pairs(merged, sp_info, abc_groups)
    inventory_analysis = build_inventory_analysis(merged)

    # Lọc theo kho nếu có yêu cầu (kho có thể là kho nguồn hoặc kho nhận)
    if target_warehouse_filter and target_warehouse_filter != "ALL":
        filtered_recs = [
            r for r in recommendations
            if r["kho_nguon"] == target_warehouse_filter or r["kho_dich"] == target_warehouse_filter
        ]
        inventory_analysis = [
            row for row in inventory_analysis
            if row["ma_kho"] == target_warehouse_filter
        ]
    else:
        filtered_recs = recommendations

    # 5. Lưu kết quả ra file JSON và CSV
    summary_result = {
        "status": "READY",
        "forecast_source": str(WEEKLY_FORECAST_FILE.name),
        "forecast_start_week": live_status.get("forecast_start_week"),
        "forecast_end_week": live_status.get("forecast_end_week"),
        "kho_ap_dung": target_warehouse_filter if target_warehouse_filter else "ALL",
        "thoi_diem_tao": datetime.now().isoformat(),
        "tong_so_de_xuat": len(filtered_recs),
        "tong_gia_tri_uoc_tinh": sum(r["gia_tri_uoc_tinh"] for r in filtered_recs),
        "inventory_analysis_status": "READY",
        "inventory_analysis": inventory_analysis,
        "phan_bo_muc_do": {
            "HIGH": sum(1 for r in filtered_recs if r["priority_code"] == "HIGH"),
            "MEDIUM": sum(1 for r in filtered_recs if r["priority_code"] == "MEDIUM"),
            "LOW": sum(1 for r in filtered_recs if r["priority_code"] == "LOW"),
        },
        "ghi_chu_nghiep_vu": (
            "Phân tích dư/thiếu dựa trên tồn khả dụng (đã trừ phiếu xuất được duyệt nhưng chưa xuất), mức tồn an toàn "
            "và dự báo nhu cầu tuần kế tiếp đã qua kiểm tra freshness; dự báo tuần được quy đổi thành nhu cầu trung bình ngày. "
            "Số lượng cần bổ sung và lượng dư có thể điều chuyển được ghi trong inventory_analysis. "
            "Hệ thống không tự động tạo phiếu điều chuyển và không tự ý thay đổi số dư tồn kho."
        ),
        "items": filtered_recs
    }

    target_json_dm, target_json_dl = persist_recommendations(
        summary_result, target_warehouse_filter
    )

    print(f"[*] Đã sinh {len(filtered_recs)} đề xuất điều chuyển:")
    print(f"    - Phân bổ ưu tiên: {summary_result['phan_bo_muc_do']}")
    print(f"    - File JSON Data Mining: {target_json_dm}")
    print(f"    - File JSON Data Lake:   {target_json_dl}")
    print("=" * 80)

    return summary_result


def main():
    # Chạy cho toàn hệ thống
    run_transfer_recommendations("ALL")
    # Chạy riêng cho từng chi nhánh kho
    for kho in ["HN01", "DN01", "HCM01"]:
        run_transfer_recommendations(kho)


if __name__ == "__main__":
    main()
