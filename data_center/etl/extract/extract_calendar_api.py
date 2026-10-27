import csv
import sys
from datetime import date, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[3]
DEMAND_FILE = (
    BASE_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_daily.csv"
)
OUTPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "lich_daily.csv"
OUTPUT_FIELDS = [
    "ngay",
    "thu_trong_tuan",
    "ten_thu",
    "la_cuoi_tuan",
    "la_ngay_le",
    "ten_ngay_le",
]

# Danh mục các ngày lễ chính thức của Việt Nam theo Bộ luật Lao động
# trong dải quan sát 18/09/2025 - 18/09/2026:
# - Tết Dương lịch: 01/01/2026
# - Tết Nguyên Đán Bính Ngọ 2026 (Mùng 1 Tết là 17/02/2026): Nghỉ từ 15/02/2026 đến 21/02/2026
# - Giỗ tổ Hùng Vương (10/3 ÂL): 26/04/2026 (Nghỉ bù: 27/04/2026)
# - Ngày Chiến thắng & Quốc tế Lao động: 30/04/2026 & 01/05/2026
# - Quốc khánh: 01/09/2026 & 02/09/2026
VIETNAM_HOLIDAYS = {
    date(2026, 1, 1): "Tết Dương lịch",
    date(2026, 2, 15): "Tết Nguyên Đán (28 Tết)",
    date(2026, 2, 16): "Tết Nguyên Đán (29 Tết)",
    date(2026, 2, 17): "Tết Nguyên Đán (Mùng 1)",
    date(2026, 2, 18): "Tết Nguyên Đán (Mùng 2)",
    date(2026, 2, 19): "Tết Nguyên Đán (Mùng 3)",
    date(2026, 2, 20): "Tết Nguyên Đán (Mùng 4)",
    date(2026, 2, 21): "Tết Nguyên Đán (Mùng 5)",
    date(2026, 4, 26): "Giỗ tổ Hùng Vương",
    date(2026, 4, 27): "Nghỉ bù Giỗ tổ Hùng Vương",
    date(2026, 4, 30): "Ngày Chiến thắng 30/4",
    date(2026, 5, 1): "Ngày Quốc tế Lao động 1/5",
    date(2026, 9, 1): "Nghỉ lễ Quốc khánh",
    date(2026, 9, 2): "Quốc khánh 2/9",
}

WEEKDAY_NAMES = [
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
    "Chủ Nhật",
]


def generate_calendar():
    if not DEMAND_FILE.exists():
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu nhu cầu để xác định dải ngày: {DEMAND_FILE}"
        )

    with DEMAND_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        dates = [
            date.fromisoformat(row["ngay"].strip())
            for row in csv.DictReader(file)
            if row.get("ngay", "").strip()
        ]
    if not dates:
        raise ValueError(f"Không có ngày hợp lệ trong dữ liệu: {DEMAND_FILE}")

    start_date = min(dates)
    end_date = max(dates)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    records = []

    current_date = start_date
    while current_date <= end_date:
        weekday = current_date.weekday()  # 0: Thứ Hai -> 6: Chủ Nhật
        is_weekend = 1 if weekday in (5, 6) else 0
        holiday_name = VIETNAM_HOLIDAYS.get(current_date, "")
        is_holiday = 1 if holiday_name else 0

        records.append({
            "ngay": current_date.isoformat(),
            "thu_trong_tuan": weekday,
            "ten_thu": WEEKDAY_NAMES[weekday],
            "la_cuoi_tuan": is_weekend,
            "la_ngay_le": is_holiday,
            "ten_ngay_le": holiday_name,
        })
        current_date += timedelta(days=1)

    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(records)

    print(f"[HOÀN TẤT] Đã tạo lịch {len(records)} ngày vào: {OUTPUT_FILE}")
    holidays_count = sum(1 for r in records if r["la_ngay_le"] == 1)
    weekends_count = sum(1 for r in records if r["la_cuoi_tuan"] == 1)
    print(f"Tổng số ngày nghỉ lễ: {holidays_count} ngày | Số ngày cuối tuần: {weekends_count} ngày")


if __name__ == "__main__":
    generate_calendar()
