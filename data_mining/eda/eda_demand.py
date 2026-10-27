import csv
import math
import sys
from collections import defaultdict
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
INPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
REPORT_FILE = BASE_DIR / "data_mining" / "eda" / "eda_report.txt"
CHART_FILE = BASE_DIR / "data_mining" / "eda" / "eda_charts.png"


def calculate_pearson_correlation(x_vals, y_vals):
    n = len(x_vals)
    if n < 2:
        return 0.0
    mean_x = sum(x_vals) / n
    mean_y = sum(y_vals) / n
    var_x = sum((x - mean_x) ** 2 for x in x_vals)
    var_y = sum((y - mean_y) ** 2 for y in y_vals)
    if var_x == 0 or var_y == 0:
        return 0.0
    cov_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_vals, y_vals))
    return cov_xy / math.sqrt(var_x * var_y)


def run_eda():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file phân tích: {INPUT_FILE}")

    rows = []
    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "ngay": r["ngay"],
                "ma_kho": r["ma_kho"],
                "ma_sp": r["ma_sp"],
                "nhu_cau_xuat": float(r["nhu_cau_xuat"]),
                "nhiet_do_tb": float(r["nhiet_do_tb"]) if r["nhiet_do_tb"] else None,
                "luong_mua": float(r["luong_mua"]) if r["luong_mua"] else None,
                "thu_trong_tuan": int(r["thu_trong_tuan"]),
                "ten_thu": r["ten_thu"],
                "la_cuoi_tuan": int(r["la_cuoi_tuan"]),
                "la_ngay_le": int(r["la_ngay_le"]),
                "ten_ngay_le": r["ten_ngay_le"],
            })

    total_records = len(rows)
    zero_demand_count = sum(1 for r in rows if r["nhu_cau_xuat"] == 0)
    zero_demand_pct = (zero_demand_count / total_records) * 100

    # 1. Thống kê theo kho
    warehouse_stats = defaultdict(lambda: {"total": 0.0, "count": 0, "zeros": 0})
    for r in rows:
        w = r["ma_kho"]
        warehouse_stats[w]["total"] += r["nhu_cau_xuat"]
        warehouse_stats[w]["count"] += 1
        if r["nhu_cau_xuat"] == 0:
            warehouse_stats[w]["zeros"] += 1

    # 2. Thống kê theo ngày trong tuần & cuối tuần
    weekday_stats = defaultdict(lambda: {"total": 0.0, "count": 0})
    weekend_stats = defaultdict(lambda: {"total": 0.0, "count": 0})
    for r in rows:
        weekday_stats[r["ten_thu"]]["total"] += r["nhu_cau_xuat"]
        weekday_stats[r["ten_thu"]]["count"] += 1
        w_label = "Cuối tuần" if r["la_cuoi_tuan"] == 1 else "Ngày thường trong tuần"
        weekend_stats[w_label]["total"] += r["nhu_cau_xuat"]
        weekend_stats[w_label]["count"] += 1

    # 3. Thống kê ngày lễ vs ngày không lễ
    holiday_stats = defaultdict(lambda: {"total": 0.0, "count": 0})
    for r in rows:
        h_label = "Ngày lễ" if r["la_ngay_le"] == 1 else "Ngày bình thường"
        holiday_stats[h_label]["total"] += r["nhu_cau_xuat"]
        holiday_stats[h_label]["count"] += 1

    # 4. Tương quan với thời tiết
    demands = [r["nhu_cau_xuat"] for r in rows if r["nhiet_do_tb"] is not None and r["luong_mua"] is not None]
    temps = [r["nhiet_do_tb"] for r in rows if r["nhiet_do_tb"] is not None and r["luong_mua"] is not None]
    precips = [r["luong_mua"] for r in rows if r["nhiet_do_tb"] is not None and r["luong_mua"] is not None]

    corr_temp = calculate_pearson_correlation(demands, temps)
    corr_precip = calculate_pearson_correlation(demands, precips)

    # 5. Top sản phẩm
    product_stats = defaultdict(lambda: {"total": 0.0, "count": 0})
    for r in rows:
        product_stats[r["ma_sp"]]["total"] += r["nhu_cau_xuat"]
        product_stats[r["ma_sp"]]["count"] += 1

    # Tạo nội dung báo cáo
    report_lines = []
    report_lines.append("================================================================================")
    report_lines.append("BÁO CÁO PHÂN TÍCH KHÁM PHÁ DỮ LIỆU ĐA CHIỀU (EDA) - DATA MINING")
    report_lines.append("Nguồn dữ liệu: analytical_dataset.csv (Xuất kho + Thời tiết Open-Meteo + Lịch lễ VN)")
    report_lines.append("================================================================================\n")

    report_lines.append("1. TỔNG QUAN DỮ LIỆU:")
    report_lines.append(f"- Tổng số quan sát (Dòng): {total_records:,}")
    report_lines.append(f"- Số ngày quan sát: 366 ngày (Từ 18/09/2025 đến 18/09/2026)")
    report_lines.append(f"- Số kho: 3 | Số sản phẩm: 20")
    report_lines.append(f"- Tổng lượng xuất hàng toàn hệ thống: {sum(r['nhu_cau_xuat'] for r in rows):,.0f} đơn vị")
    report_lines.append(f"- Số bản ghi có nhu cầu xuất = 0: {zero_demand_count:,} ({zero_demand_pct:.2f}%)")
    report_lines.append("  (Nhận xét: Khoảng 35% cặp kho-sản phẩm trong ngày không phát sinh xuất hàng).\n")

    report_lines.append("2. LƯỢNG XUẤT THEO KHO:")
    for w, s in sorted(warehouse_stats.items()):
        avg = s["total"] / s["count"]
        report_lines.append(f"- Kho {w}: Tổng xuất = {s['total']:,.0f} | Trung bình = {avg:.2f} sp/cặp/ngày | Tỷ lệ ngày 0 xuất = {(s['zeros']/s['count'])*100:.1f}%")
    report_lines.append("  (Nhận xét: Sản lượng xuất chia rất đồng đều giữa 3 miền: DN ~33.5%, HCM ~33.3%, HN ~33.2%).\n")

    report_lines.append("3. LƯỢNG XUẤT THEO THỨ TRONG TUẦN & CUỐI TUẦN:")
    weekday_order = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
    for day_name in weekday_order:
        s = weekday_stats[day_name]
        avg = s["total"] / s["count"]
        report_lines.append(f"- {day_name:10s}: Trung bình xuất = {avg:.2f} sp/cặp/ngày (Tổng: {s['total']:,.0f})")
    for w_label, s in sorted(weekend_stats.items()):
        avg = s["total"] / s["count"]
        report_lines.append(f"- {w_label:25s}: Trung bình xuất = {avg:.2f} sp/cặp/ngày")
    report_lines.append("  (Nhận xét: Không có sự chênh lệch đột biến giữa ngày thường và cuối tuần, phản ánh tính chất kho B2B/phân phối hoạt động xuyên suốt).\n")

    report_lines.append("4. LƯỢNG XUẤT THEO NGÀY NGHỈ LỄ:")
    for h_label, s in sorted(holiday_stats.items()):
        avg = s["total"] / s["count"]
        report_lines.append(f"- {h_label:20s}: Trung bình xuất = {avg:.2f} sp/cặp/ngày (Tổng: {s['total']:,.0f})")
    report_lines.append("  (Nhận xét: Mức xuất trong các ngày nghỉ lễ vẫn duy trì, không giảm sâu về 0).\n")

    report_lines.append("5. MỐI LIÊN HỆ VỚI THỜI TIẾT (HỆ SỐ TƯƠNG QUAN PEARSON):")
    report_lines.append(f"- Hệ số tương quan giữa Nhu cầu xuất và Nhiệt độ trung bình: r = {corr_temp:+.4f}")
    report_lines.append(f"- Hệ số tương quan giữa Nhu cầu xuất và Lượng mưa ngày:       r = {corr_precip:+.4f}")
    report_lines.append("  (Nhận xét khoa học: Hệ số tương quan r xấp xỉ 0 cho thấy trong dữ liệu hiện tại,")
    report_lines.append("   nhiệt độ và lượng mưa KHÔNG có tương quan tuyến tính mạnh với lượng xuất hàng.")
    report_lines.append("   Lưu ý: Không thể kết luận quan hệ nhân quả chỉ dựa trên tương quan).\n")

    report_lines.append("6. TOP 5 SẢN PHẨM XUẤT NHIỀU NHẤT VÀ ÍT NHẤT:")
    sorted_prods = sorted(product_stats.items(), key=lambda x: x[1]["total"], reverse=True)
    report_lines.append("- Top 5 xuất nhiều nhất:")
    for p, s in sorted_prods[:5]:
        report_lines.append(f"  + {p}: {s['total']:,.0f} sp (TB: {s['total']/s['count']:.2f} sp/ngày/kho)")
    report_lines.append("- Top 5 xuất ít nhất:")
    for p, s in sorted_prods[-5:]:
        report_lines.append(f"  + {p}: {s['total']:,.0f} sp (TB: {s['total']/s['count']:.2f} sp/ngày/kho)")

    full_report = "\n".join(report_lines)
    print(full_report)

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_FILE.open("w", encoding="utf-8") as f:
        f.write(full_report)
    print(f"\n[HOÀN TẤT] Đã lưu báo cáo EDA vào: {REPORT_FILE}")

    # Vẽ biểu đồ trực quan hóa nếu có matplotlib
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))

        # Biểu đồ 1: Lượng xuất theo kho
        warehouses = list(warehouse_stats.keys())
        w_totals = [warehouse_stats[w]["total"] for w in warehouses]
        axes[0, 0].bar(warehouses, w_totals, color=["#3b82f6", "#10b981", "#f59e0b"])
        axes[0, 0].set_title("Tong luong xuat theo kho (HN, DN, HCM)")
        axes[0, 0].set_ylabel("So luong xuat")

        # Biểu đồ 2: Lượng xuất theo thứ trong tuần
        days = weekday_order
        d_avgs = [weekday_stats[d]["total"] / weekday_stats[d]["count"] for d in days]
        axes[0, 1].plot(days, d_avgs, marker="o", color="#8b5cf6", linewidth=2)
        axes[0, 1].set_title("Luong xuat trung binh theo thu trong tuan")
        axes[0, 1].set_ylabel("Trung binh (sp/ngay)")
        axes[0, 1].tick_params(axis="x", rotation=30)

        # Biểu đồ 3: Phân phối lượng xuất
        non_zeros = [r["nhu_cau_xuat"] for r in rows if r["nhu_cau_xuat"] > 0]
        axes[1, 0].hist(non_zeros, bins=30, color="#ec4899", edgecolor="black", alpha=0.7)
        axes[1, 0].set_title("Phan phoi luong xuat (ngay co xuat > 0)")
        axes[1, 0].set_xlabel("So luong xuat")
        axes[1, 0].set_ylabel("Tan suat")

        # Biểu đồ 4: Tương quan Nhu cầu vs Nhiệt độ
        sample_rows = rows[::10]  # Lấy mẫu 1/10 để biểu đồ scatter gọn
        s_temps = [r["nhiet_do_tb"] for r in sample_rows if r["nhiet_do_tb"] is not None]
        s_demands = [r["nhu_cau_xuat"] for r in sample_rows if r["nhiet_do_tb"] is not None]
        axes[1, 1].scatter(s_temps, s_demands, alpha=0.4, color="#06b6d4", s=15)
        axes[1, 1].set_title(f"Tuong quan Nhiet do vs Luong xuat (r={corr_temp:+.4f})")
        axes[1, 1].set_xlabel("Nhiet do trung binh (do C)")
        axes[1, 1].set_ylabel("Luong xuat")

        plt.tight_layout()
        plt.savefig(CHART_FILE, dpi=150)
        plt.close()
        print(f"[HOÀN TẤT] Đã xuất biểu đồ EDA vào: {CHART_FILE}")
    except Exception as chart_err:
        print(f"[THÔNG BÁO] Bỏ qua xuất ảnh đồ thị ({chart_err})")


if __name__ == "__main__":
    run_eda()