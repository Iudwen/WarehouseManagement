import json
import os
import sys
from datetime import datetime
from pathlib import Path
import numpy as np
import pandas as pd

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]

# Đường dẫn dữ liệu đầu vào
TON_KHO_FILE = BASE_DIR / "data_center" / "data_lake" / "silver" / "postgresql" / "central" / "ton_kho_central.csv"
FORECAST_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "forecast_results.csv"
ABC_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "abc_xyz_analysis.json"
SP_FILE = BASE_DIR / "data_center" / "data_lake" / "silver" / "postgresql" / "central" / "san_pham.csv"

# Đường dẫn file đầu ra
GOLD_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
OUTPUT_JSON_DM = GOLD_DIR / "transfer_recommendations.json"
OUTPUT_CSV_DM = GOLD_DIR / "transfer_recommendations.csv"

DATA_LAKE_GOLD_DIR = BASE_DIR / "data_center" / "data_lake" / "gold"
OUTPUT_JSON_DL = DATA_LAKE_GOLD_DIR / "transfer_recommendations.json"
OUTPUT_CSV_DL = DATA_LAKE_GOLD_DIR / "transfer_recommendations.csv"


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

                # Làm tròn lên bội số của 5 để thuận tiện đóng gói nhưng tuyệt đối không vượt quá lượng thặng dư còn lại
                transfer_qty = int(np.ceil(raw_transfer_qty / 5.0) * 5)
                transfer_qty = min(transfer_qty, available)
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
                    "dos_kho_nguon": dos_nguon,
                    "kho_dich": def_row["ma_kho"],
                    "ton_kho_dich": int(def_row["so_luong"]),
                    "dos_kho_dich": dos_dich,
                    "so_luong_de_xuat": transfer_qty,
                    "gia_tri_uoc_tinh": transfer_qty * sp_meta["gia_ban"],
                    "muc_do_uu_tien": priority,
                    "priority_code": priority_code,
                    "can_cu_de_xuat": (
                        f"Kho nhận {def_row['ma_kho']} chỉ còn {int(def_row['so_luong'])} sp "
                        f"(đáp ứng {dos_dich:.1f} ngày xuất, thiếu {needed} sp so với định mức an toàn "
                        f"{target_stock_val} sp). Kho nguồn {src_kho} đang thặng dư {available} sp khả dụng "
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


def run_transfer_recommendations(target_warehouse_filter=None):
    """
    Sinh các đề xuất điều chuyển hàng liên kho (Decision Support System - DSS):
    - Đọc tồn kho hiện tại (ton_kho_central.csv)
    - Đọc nhu cầu dự báo hàng ngày (forecast_results.csv)
    - Đọc phân loại giá trị & độ biến động (abc_xyz_analysis.json)
    - Xác định kho thiếu hụt (Deficit) và kho thặng dư (Surplus)
    - Ghép cặp tối ưu điều chuyển liên kho, tính lượng chuyển và lý do khoa học
    """
    wh_label = target_warehouse_filter if target_warehouse_filter and target_warehouse_filter != "ALL" else "TOÀN HỆ THỐNG"
    print("=" * 80)
    print(f"HỖ TRỢ QUYẾT ĐỊNH ĐIỀU CHUYỂN HÀNG LIÊN KHO ({wh_label})")
    print("=" * 80)

    if not TON_KHO_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file tồn kho: {TON_KHO_FILE}")
    if not FORECAST_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file dự báo nhu cầu: {FORECAST_FILE}")

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

    # 3. Đọc tồn kho và dự báo
    df_ton = pd.read_csv(TON_KHO_FILE)
    df_fc = pd.read_csv(FORECAST_FILE)

    # Tính nhu cầu dự báo trung bình hàng ngày theo kho và sp
    daily_fc = df_fc.groupby(["ma_kho", "ma_sp"])["du_bao_ridge"].mean().reset_index()
    daily_fc.rename(columns={"du_bao_ridge": "demand_per_day"}, inplace=True)

    # Hợp nhất tồn kho và dự báo
    merged = pd.merge(df_ton, daily_fc, on=["ma_kho", "ma_sp"], how="inner")

    # Mức đệm an toàn theo nhóm ABC (Pareto)
    def get_safety_days(sp_id):
        grp = abc_groups.get(sp_id, {}).get("nhom_abc", "B")
        if grp == "A":
            return 14  # 14 ngày an toàn cho hàng giá trị cao (nhóm A)
        elif grp == "B":
            return 10  # 10 ngày cho nhóm B
        else:
            return 7   # 7 ngày cho nhóm C

    # Loại bỏ dữ liệu tồn kho không hợp lệ (số lượng âm)
    merged = merged[merged["so_luong"] >= 0].copy()

    merged["safety_days"] = merged["ma_sp"].apply(get_safety_days)
    merged["target_stock"] = np.round(merged["demand_per_day"].clip(lower=0) * merged["safety_days"])
    
    # Xử lý an toàn tránh chia cho 0 khi nhu cầu dự báo bằng 0
    safe_demand = merged["demand_per_day"].replace(0, np.nan)
    merged["dos"] = np.where(
        safe_demand.isna(),
        np.where(merged["so_luong"] > 0, 999.0, 0.0),
        np.round(merged["so_luong"] / safe_demand, 1)
    )
    merged["surplus"] = merged["so_luong"] - merged["target_stock"]

    # 4. Tìm các cặp điều chuyển liên kho
    recommendations = compute_transfer_pairs(merged, sp_info, abc_groups)

    # Lọc theo kho nếu có yêu cầu (kho có thể là kho nguồn hoặc kho nhận)
    if target_warehouse_filter and target_warehouse_filter != "ALL":
        filtered_recs = [
            r for r in recommendations
            if r["kho_nguon"] == target_warehouse_filter or r["kho_dich"] == target_warehouse_filter
        ]
    else:
        filtered_recs = recommendations

    # 5. Lưu kết quả ra file JSON và CSV
    GOLD_DIR.mkdir(parents=True, exist_ok=True)
    DATA_LAKE_GOLD_DIR.mkdir(parents=True, exist_ok=True)

    summary_result = {
        "kho_ap_dung": target_warehouse_filter if target_warehouse_filter else "ALL",
        "thoi_diem_tao": datetime.now().isoformat(),
        "tong_so_de_xuat": len(filtered_recs),
        "tong_gia_tri_uoc_tinh": sum(r["gia_tri_uoc_tinh"] for r in filtered_recs),
        "phan_bo_muc_do": {
            "HIGH": sum(1 for r in filtered_recs if r["priority_code"] == "HIGH"),
            "MEDIUM": sum(1 for r in filtered_recs if r["priority_code"] == "MEDIUM"),
            "LOW": sum(1 for r in filtered_recs if r["priority_code"] == "LOW"),
        },
        "ghi_chu_nghiep_vu": (
            "Đề xuất điều phối mang tính hỗ trợ quyết định (Decision Support System), dựa trên cân bằng mức tồn an toàn "
            "và nhu cầu dự báo chuỗi thời gian; hệ thống không tự động tạo phiếu điều chuyển và không tự ý thay đổi số dư tồn kho."
        ),
        "items": filtered_recs
    }

    # Xuất file JSON
    json_str = json.dumps(summary_result, ensure_ascii=False, indent=2)
    suffix = f"_{target_warehouse_filter}" if target_warehouse_filter and target_warehouse_filter != "ALL" else ""
    
    target_json_dm = GOLD_DIR / f"transfer_recommendations{suffix}.json"
    target_json_dl = DATA_LAKE_GOLD_DIR / f"transfer_recommendations{suffix}.json"
    target_csv_dm = GOLD_DIR / f"transfer_recommendations{suffix}.csv"
    target_csv_dl = DATA_LAKE_GOLD_DIR / f"transfer_recommendations{suffix}.csv"

    target_json_dm.write_text(json_str, encoding="utf-8")
    target_json_dl.write_text(json_str, encoding="utf-8")

    # Xuất file CSV
    if len(filtered_recs) > 0:
        df_recs = pd.DataFrame(filtered_recs)
        df_recs.to_csv(target_csv_dm, index=False, encoding="utf-8-sig")
        df_recs.to_csv(target_csv_dl, index=False, encoding="utf-8-sig")

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
