
from pathlib import Path
import pandas as pd

ROOT = Path(r"D:\WarehouseManagement")
OUT = ROOT / "data_mining" / "datasets" / "external"
OUT.mkdir(parents=True, exist_ok=True)

FILE = OUT / "official_holiday_overrides.csv"

COLUMNS = [
    "date", "event_name", "record_type", "is_public_holiday",
    "is_day_off", "is_compensatory", "is_makeup_workday",
    "applicability", "source", "source_url",
    "verification_status", "notes"
]

# Các ngày lễ chính để bổ sung.
# Ngày nghỉ thực tế cần đối chiếu theo lịch áp dụng của từng đơn vị.
holidays = [
    ("2023-01-01", "Tết Dương lịch", 1),
    ("2023-01-20", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2023-01-21", "Tết Nguyên đán", 1),
    ("2023-01-22", "Tết Nguyên đán", 1),
    ("2023-01-23", "Tết Nguyên đán", 1),
    ("2023-01-24", "Tết Nguyên đán", 1),
    ("2023-01-25", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2023-04-29", "Giỗ Tổ Hùng Vương", 1),
    ("2023-04-30", "Ngày Giải phóng miền Nam", 1),
    ("2023-05-01", "Quốc tế Lao động", 1),
    ("2023-09-02", "Quốc khánh", 1),

    ("2024-01-01", "Tết Dương lịch", 1),
    ("2024-02-08", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2024-02-09", "Tết Nguyên đán", 1),
    ("2024-02-10", "Tết Nguyên đán", 1),
    ("2024-02-11", "Tết Nguyên đán", 1),
    ("2024-02-12", "Tết Nguyên đán", 1),
    ("2024-04-18", "Giỗ Tổ Hùng Vương", 1),
    ("2024-04-30", "Ngày Giải phóng miền Nam", 1),
    ("2024-05-01", "Quốc tế Lao động", 1),
    ("2024-09-02", "Quốc khánh", 1),

    ("2025-01-01", "Tết Dương lịch", 1),
    ("2025-01-25", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2025-01-28", "Tết Nguyên đán", 1),
    ("2025-01-29", "Tết Nguyên đán", 1),
    ("2025-01-30", "Tết Nguyên đán", 1),
    ("2025-01-31", "Tết Nguyên đán", 1),
    ("2025-04-07", "Giỗ Tổ Hùng Vương", 1),
    ("2025-04-30", "Ngày Giải phóng miền Nam", 1),
    ("2025-05-01", "Quốc tế Lao động", 1),
    ("2025-09-02", "Quốc khánh", 1),

    ("2027-01-01", "Tết Dương lịch", 1),
    ("2027-02-04", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2027-02-05", "Tết Nguyên đán", 1),
    ("2027-02-06", "Tết Nguyên đán", 1),
    ("2027-02-07", "Tết Nguyên đán", 1),
    ("2027-02-08", "Tết Nguyên đán", 1),
    ("2027-02-09", "Tết Nguyên đán", 1),
    ("2027-02-10", "Kỳ nghỉ Tết Nguyên đán", 0),
    ("2027-04-16", "Giỗ Tổ Hùng Vương", 1),
    ("2027-04-30", "Ngày Giải phóng miền Nam", 1),
    ("2027-05-01", "Quốc tế Lao động", 1),
    ("2027-09-02", "Quốc khánh", 1),
    ("2027-09-03", "Ngày nghỉ Quốc khánh theo lịch công chức", 0),
]

rows = []

for date, name, public_holiday in holidays:
    rows.append({
        "date": date,
        "event_name": name,
        "record_type": "MANUAL_HOLIDAY",
        "is_public_holiday": public_holiday,
        "is_day_off": "",
        "is_compensatory": 0,
        "is_makeup_workday": 0,
        "applicability": "VERIFY_OFFICIAL_SCHEDULE",
        "source": "MANUAL_SEED",
        "source_url": "",
        "verification_status": "NEEDS_VERIFICATION",
        "notes": "Ngay le tham khao; doi chieu lich nghi chinh thuc."
    })

new_df = pd.DataFrame(rows, columns=COLUMNS)

if FILE.exists():
    old_df = pd.read_csv(FILE, dtype=str).fillna("")
    for col in COLUMNS:
        if col not in old_df.columns:
            old_df[col] = ""
    combined = pd.concat([old_df[COLUMNS], new_df], ignore_index=True)
else:
    combined = new_df

combined = combined.drop_duplicates(
    subset=["date", "event_name", "record_type", "source"]
)

combined.to_csv(FILE, index=False, encoding="utf-8-sig")

print("Da tao/cap nhat:", FILE)
print("So dong ngay le:", len(combined))
print("Luu y: doi chieu cac dong NEEDS_VERIFICATION truoc khi su dung.")
