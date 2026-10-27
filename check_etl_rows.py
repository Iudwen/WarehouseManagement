from pathlib import Path
import pandas as pd

base = Path(r"D:\WarehouseManagement")

files = [
    base / "data_mining/datasets/raw/lich_su_xuat_hang.csv",
    base / "data_center/data_lake/silver/postgresql/central/xuat_hang_central.csv",
]

for file in files:
    print(f"\nFile: {file}")

    if not file.exists():
        print("KHONG TIM THAY FILE")
        continue

    df = pd.read_csv(file)

    print("So dong:", len(df))
    print("So cot:", len(df.columns))
    print("Cac cot:", list(df.columns))
    print("So dong trung lap:", df.duplicated().sum())
    print("So o thieu:", int(df.isna().sum().sum()))