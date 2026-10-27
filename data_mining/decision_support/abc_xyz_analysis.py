import csv
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
import pandas as pd
import numpy as np

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]

def get_data_lake_dir():
    if "DATA_LAKE_DIR" in os.environ:
        return Path(os.environ["DATA_LAKE_DIR"])
    if Path("/app/data_lake").is_dir():
        return Path("/app/data_lake")
    return BASE_DIR / "data_center" / "data_lake"

DATA_LAKE_DIR = get_data_lake_dir()
SILVER_XUAT_FILE = DATA_LAKE_DIR / "silver" / "postgresql" / "central" / "xuat_hang_central.csv"
SILVER_SP_FILE = DATA_LAKE_DIR / "silver" / "postgresql" / "central" / "san_pham.csv"
GOLD_DAILY_FILE = DATA_LAKE_DIR / "gold" / "nhu_cau_xuat_hang_daily.csv"

# Fallbacks if Data Lake files are in data_mining
DM_GOLD_DAILY_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
DM_RAW_XUAT_FILE = BASE_DIR / "data_mining" / "datasets" / "raw" / "lich_su_xuat_hang.csv"

OUTPUT_DM_CSV = BASE_DIR / "data_mining" / "datasets" / "gold" / "abc_xyz_analysis.csv"
OUTPUT_DM_JSON = BASE_DIR / "data_mining" / "datasets" / "gold" / "abc_xyz_analysis.json"
OUTPUT_DL_CSV = DATA_LAKE_DIR / "gold" / "abc_xyz_analysis.csv"
OUTPUT_DL_JSON = DATA_LAKE_DIR / "gold" / "abc_xyz_analysis.json"

# Layout recommendation logic based on 9 ABC-XYZ combinations
LAYOUT_RECOMMENDATIONS = {
    "AX": {
        "priority": "Rất cao (Chiến lược)",
        "layout_principle": "Bố trí tại vị trí trung tâm, gần lối đi chính, dễ tiếp cận và kiểm soát an ninh tốt.",
        "inventory_policy": "Kiểm kê định kỳ thường xuyên (chu kỳ ngắn), áp dụng mô hình đặt hàng Continuous Review.",
        "rationale": "Sản phẩm đóng góp doanh thu lớn nhất và nhu cầu xuất ổn định, dự báo chính xác cao."
    },
    "AY": {
        "priority": "Cao (Quan trọng)",
        "layout_principle": "Bố trí tại khu vực tiêu chuẩn tầng 1-2, gần lối xuất hàng, kiểm soát tồn an toàn linh hoạt.",
        "inventory_policy": "Dự báo theo chu kỳ tuần/tháng, duy trì tồn kho an toàn (safety stock) mức vừa.",
        "rationale": "Giá trị kinh tế lớn nhưng nhu cầu biến động theo mùa/thời vụ, cần theo dõi sát."
    },
    "AZ": {
        "priority": "Cao (Rủi ro cao)",
        "layout_principle": "Bố trí tại khu vực an toàn cao, vị trí bảo quản tiêu chuẩn, giám sát số lượng chặt chẽ.",
        "inventory_policy": "Quản lý theo đơn hàng cụ thể (Make/Ship-to-order), hạn chế tồn kho đệm dài hạn tránh đọng vốn.",
        "rationale": "Giá trị rất cao nhưng nhu cầu biến động mạnh, khó dự đoán, nguy cơ rủi ro vốn lớn."
    },
    "BX": {
        "priority": "Trung bình - Cao",
        "layout_principle": "Bố trí tại các kệ trung tâm tầng 2-3, vị trí thuận tiện cho xe nâng và lấy hàng.",
        "inventory_policy": "Áp dụng chính sách đặt hàng định kỳ (Periodic Review) với mức tồn đệm ổn định.",
        "rationale": "Giá trị trung bình, nhu cầu xuất đều đặn, dễ dự báo."
    },
    "BY": {
        "priority": "Trung bình",
        "layout_principle": "Bố trí tại các dãy kệ tiêu chuẩn trong kho, thuận tiện bốc xếp.",
        "inventory_policy": "Dự báo kết hợp mức tồn kho an toàn trung bình, rà soát nhu cầu hàng tháng.",
        "rationale": "Đóng góp doanh thu trung bình, có biến động nhất định theo mùa."
    },
    "BZ": {
        "priority": "Trung bình - Thấp",
        "layout_principle": "Bố trí ở khu vực linh hoạt, có thể bố trí ở kệ cao hoặc xa khu vực xuất hơn một chút.",
        "inventory_policy": "Mức tồn kho an toàn vừa phải, theo dõi chặt chẽ để tránh tồn kho lâu ngày.",
        "rationale": "Giá trị trung bình nhưng nhu cầu thất thường."
    },
    "CX": {
        "priority": "Ưu tiên tốc độ xuất (Fast-picking)",
        "layout_principle": "Bố trí gần khu vực đóng gói/xuất hàng (Fast-picking zone), tầng thấp dễ lấy tay.",
        "inventory_policy": "Đặt hàng số lượng lớn (EOQ lớn) để hưởng chiết khấu vận chuyển và giảm tần suất đặt hàng.",
        "rationale": "Giá trị kinh tế thấp nhưng tần suất xuất liên tục, đều đặn; đặt gần cửa để tối ưu công sức lấy hàng."
    },
    "CY": {
        "priority": "Thấp",
        "layout_principle": "Bố trí tại các tầng kệ cao hơn hoặc các dãy kệ xa cửa xuất.",
        "inventory_policy": "Đặt hàng định kỳ khi tồn kho giảm xuống mức tối thiểu.",
        "rationale": "Giá trị thấp và nhu cầu biến động, chi phí lưu kho cần được tiết giảm tối đa."
    },
    "CZ": {
        "priority": "Rất thấp (Slow-moving)",
        "layout_principle": "Bố trí tại góc xa nhất của kho hoặc tầng cao nhất (Slow-moving area) để nhường vị trí đẹp.",
        "inventory_policy": "Duy trì mức tồn tối thiểu hoặc chỉ đặt hàng khi có yêu cầu xuất cụ thể.",
        "rationale": "Giá trị đóng góp rất thấp và nhu cầu thất thường, ít khi phát sinh xuất hàng."
    }
}


def run_abc_xyz_analysis(warehouse_filter=None):
    """
    Thực hiện phân loại ABC-XYZ và đưa ra gợi ý bố trí kho cho từng sản phẩm:
    - warehouse_filter: None hoặc 'ALL' (toàn hệ thống), hoặc mã kho chi nhánh ('HN01', 'DN01', 'HCM01')
    """
    wh_label = warehouse_filter if warehouse_filter and warehouse_filter != "ALL" else "TOÀN HỆ THỐNG"
    print("=" * 80)
    print(f"PHÂN TÍCH ABC-XYZ & GỢI Ý BỐ TRÍ KHO ({wh_label})")
    print("=" * 80)

    # 1. Đọc danh mục sản phẩm
    sp_names = {}
    sp_prices = {}
    if SILVER_SP_FILE.exists():
        df_sp = pd.read_csv(SILVER_SP_FILE)
        for _, r in df_sp.iterrows():
            sp_names[r["ma_sp"]] = r["ten_sp"]
            sp_prices[r["ma_sp"]] = float(r.get("gia_ban", 0))

    # 2. Đọc dữ liệu xuất kho
    if not SILVER_XUAT_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file xuất kho: {SILVER_XUAT_FILE}")

    df_xh = pd.read_csv(SILVER_XUAT_FILE)
    if warehouse_filter and warehouse_filter != "ALL":
        df_xh = df_xh[df_xh["ma_kho"] == warehouse_filter].copy()

    if len(df_xh) == 0:
        raise ValueError(f"Không có dữ liệu xuất hàng cho kho: {warehouse_filter}")

    # Tổng hợp theo sản phẩm cho ABC (Doanh thu & Sản lượng)
    prod_agg = df_xh.groupby("ma_sp").agg(
        tong_so_luong=("so_luong", "sum"),
        tong_gia_tri=("thanh_tien", "sum"),
        so_dong_xuat=("id", "count"),
        so_phieu_xuat=("ma_phieu_xuat", "nunique")
    ).reset_index()

    total_system_value = prod_agg["tong_gia_tri"].sum()
    total_system_qty = prod_agg["tong_so_luong"].sum()

    # Sắp xếp giảm dần theo giá trị để phân loại ABC
    prod_agg = prod_agg.sort_values("tong_gia_tri", ascending=False).reset_index(drop=True)
    prod_agg["ty_le_gia_tri"] = (prod_agg["tong_gia_tri"] / total_system_value) * 100
    prod_agg["ty_le_tich_luy"] = prod_agg["ty_le_gia_tri"].cumsum()

    # Phân loại ABC theo quy tắc Pareto chuẩn 80% / 15% / 5%
    abc_list = []
    for i in range(len(prod_agg)):
        prev_cum = prod_agg.loc[i - 1, "ty_le_tich_luy"] if i > 0 else 0.0
        if prev_cum < 80.0:
            abc_list.append("A")
        elif prev_cum < 95.0:
            abc_list.append("B")
        else:
            abc_list.append("C")
    prod_agg["nhom_abc"] = abc_list

    # 3. Đọc dữ liệu Daily demand để tính XYZ (Hệ số biến thiên CV)
    daily_file = GOLD_DAILY_FILE if GOLD_DAILY_FILE.exists() else DM_GOLD_DAILY_FILE
    if not daily_file.exists():
        raise FileNotFoundError(f"Không tìm thấy file nhu cầu daily: {daily_file}")

    df_daily = pd.read_csv(daily_file)
    if warehouse_filter and warehouse_filter != "ALL":
        df_daily = df_daily[df_daily["ma_kho"] == warehouse_filter].copy()
    else:
        df_daily = df_daily.groupby(["ngay", "ma_sp"])["nhu_cau_xuat"].sum().reset_index()

    # Tính CV cho từng sản phẩm
    xyz_map = {}
    for ma_sp, grp in df_daily.groupby("ma_sp"):
        mean_val = float(grp["nhu_cau_xuat"].mean())
        std_val = float(grp["nhu_cau_xuat"].std())
        zero_days = int((grp["nhu_cau_xuat"] == 0).sum())
        total_days = len(grp)
        zero_pct = (zero_days / total_days) * 100.0 if total_days > 0 else 0.0

        # CV = std / mean
        cv = (std_val / mean_val) if mean_val > 0 else 999.0

        is_branch = bool(warehouse_filter and warehouse_filter != "ALL")
        thresh_x = 1.05 if is_branch else 0.65
        thresh_y = 1.15 if is_branch else 0.75

        if cv <= thresh_x:
            cat_xyz = "X"
        elif cv <= thresh_y:
            cat_xyz = "Y"
        else:
            cat_xyz = "Z"

        xyz_map[ma_sp] = {
            "mean_daily": round(mean_val, 2),
            "std_daily": round(std_val, 2),
            "cv": round(cv, 4),
            "zero_days": zero_days,
            "zero_pct": round(zero_pct, 1),
            "total_days": total_days,
            "nhom_xyz": cat_xyz
        }

    # 4. Hợp nhất kết quả và sinh gợi ý bố trí
    results = []
    for _, r in prod_agg.iterrows():
        sp_id = r["ma_sp"]
        xyz_info = xyz_map.get(sp_id, {
            "mean_daily": 0.0, "std_daily": 0.0, "cv": 999.0,
            "zero_days": 0, "zero_pct": 0.0, "total_days": 366, "nhom_xyz": "Z"
        })

        abc_cat = r["nhom_abc"]
        xyz_cat = xyz_info["nhom_xyz"]
        combined_cat = f"{abc_cat}{xyz_cat}"

        rec = LAYOUT_RECOMMENDATIONS.get(combined_cat, {
            "priority": "Tiêu chuẩn",
            "layout_principle": "Bố trí tại vị trí tiêu chuẩn.",
            "inventory_policy": "Theo dõi định kỳ.",
            "rationale": "Sản phẩm thông thường."
        })

        results.append({
            "ma_sp": sp_id,
            "ten_sp": sp_names.get(sp_id, sp_id),
            "gia_ban": sp_prices.get(sp_id, 0.0),
            "tong_so_luong": int(r["tong_so_luong"]),
            "tong_gia_tri": float(r["tong_gia_tri"]),
            "ty_le_gia_tri": round(float(r["ty_le_gia_tri"]), 2),
            "ty_le_tich_luy": round(float(r["ty_le_tich_luy"]), 2),
            "so_phieu_xuat": int(r["so_phieu_xuat"]),
            "so_dong_xuat": int(r["so_dong_xuat"]),
            "nhom_abc": abc_cat,
            "mean_daily": xyz_info["mean_daily"],
            "std_daily": xyz_info["std_daily"],
            "cv": xyz_info["cv"],
            "zero_pct": xyz_info["zero_pct"],
            "nhom_xyz": xyz_cat,
            "nhom_abc_xyz": combined_cat,
            "muc_uu_tien": rec["priority"],
            "nguyen_tac_bo_tri": rec["layout_principle"],
            "chinh_sach_ton_kho": rec["inventory_policy"],
            "ly_do_de_xuat": rec["rationale"],
            "kho_ap_dung": warehouse_filter if warehouse_filter else "ALL"
        })

    # 5. Xuất kết quả CSV và JSON
    df_result = pd.DataFrame(results)

    for p in [OUTPUT_DM_CSV, OUTPUT_DL_CSV]:
        p.parent.mkdir(parents=True, exist_ok=True)

    suffix = f"_{warehouse_filter}" if warehouse_filter and warehouse_filter != "ALL" else ""
    csv_dm_target = OUTPUT_DM_CSV.parent / f"abc_xyz_analysis{suffix}.csv"
    csv_dl_target = OUTPUT_DL_CSV.parent / f"abc_xyz_analysis{suffix}.csv"
    json_dm_target = OUTPUT_DM_JSON.parent / f"abc_xyz_analysis{suffix}.json"
    json_dl_target = OUTPUT_DL_JSON.parent / f"abc_xyz_analysis{suffix}.json"

    df_result.to_csv(csv_dm_target, index=False, encoding="utf-8-sig")
    df_result.to_csv(csv_dl_target, index=False, encoding="utf-8-sig")

    summary_metadata = {
        "kho_ap_dung": warehouse_filter if warehouse_filter else "ALL",
        "tong_so_san_pham": len(results),
        "tong_doanh_thu": total_system_value,
        "tong_san_luong": int(total_system_qty),
        "phan_bo_abc": df_result["nhom_abc"].value_counts().to_dict(),
        "phan_bo_xyz": df_result["nhom_xyz"].value_counts().to_dict(),
        "phan_bo_matrix": df_result["nhom_abc_xyz"].value_counts().to_dict(),
        "nguong_abc": {"A": "<= 80%", "B": "80% - 95%", "C": "> 95%"},
        "ghi_chu_bo_tri": "Gợi ý mang tính nguyên tắc phân vùng quản lý và tối ưu hóa luồng picking; chưa áp dụng tọa độ kệ vật lý do database chưa lưu trữ sơ đồ không gian 3D của nhà kho.",
        "items": results
    }

    json_str = json.dumps(summary_metadata, indent=2, ensure_ascii=False)
    json_dm_target.write_text(json_str, encoding="utf-8")
    json_dl_target.write_text(json_str, encoding="utf-8")

    print(f"[*] Đã hoàn tất phân loại cho {len(results)} sản phẩm:")
    print(f"    - Phân bổ ABC: {summary_metadata['phan_bo_abc']}")
    print(f"    - Phân bổ XYZ: {summary_metadata['phan_bo_xyz']}")
    print(f"    - Ma trận 9 nhóm: {summary_metadata['phan_bo_matrix']}")
    print(f"    - File kết quả CSV:  {csv_dm_target}")
    print(f"    - File kết quả JSON: {json_dm_target}")
    print("=" * 80)

    return summary_metadata


if __name__ == "__main__":
    wh = sys.argv[1] if len(sys.argv) > 1 else None
    run_abc_xyz_analysis(warehouse_filter=wh)
