
from pathlib import Path
import pandas as pd
import numpy as np

BASE_DIR = Path(r"D:\WarehouseManagement\data_mining")

INPUT_FILE = (
    BASE_DIR
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_with_external.csv"
)

OUTPUT_FILE = (
    BASE_DIR
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_features.csv"
)

REPORT_FILE = (
    BASE_DIR
    / "datasets"
    / "gold"
    / "feature_engineering_report.csv"
)

CONTINUITY_FILE = (
    BASE_DIR
    / "datasets"
    / "gold"
    / "forecast_series_continuity.csv"
)

# False: khong tu dong dien 0 cho ngay thieu.
# Chi doi thanh True khi da xac nhan ngay khong co giao dich
# dong nghia voi nhu cau xuat hang bang 0.
FILL_MISSING_DAYS_WITH_ZERO = False

GROUP_COLUMNS = ["ma_kho", "ma_sp"]
TARGET_COLUMN = "nhu_cau_xuat"

LAG_WINDOWS = [1, 7, 14, 28]
ROLLING_WINDOWS = [7, 14, 28]


def load_and_validate_data():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Khong tim thay file dau vao: {INPUT_FILE}"
        )

    df = pd.read_csv(INPUT_FILE)

    required_columns = [
        "ngay",
        "ma_kho",
        "ma_sp",
        TARGET_COLUMN
    ]

    missing_columns = [
        col for col in required_columns
        if col not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Thieu cac cot bat buoc: {missing_columns}"
        )

    df["ngay"] = pd.to_datetime(
        df["ngay"],
        errors="coerce"
    )

    df[TARGET_COLUMN] = pd.to_numeric(
        df[TARGET_COLUMN],
        errors="coerce"
    )

    if df["ngay"].isna().any():
        raise ValueError(
            "Cot ngay co gia tri khong hop le."
        )

    if df[GROUP_COLUMNS].isna().any().any():
        raise ValueError(
            "Ma kho hoac ma san pham co gia tri rong."
        )

    if df[TARGET_COLUMN].isna().any():
        raise ValueError(
            "Nhu cau xuat co gia tri rong hoac khong hop le."
        )

    if (df[TARGET_COLUMN] < 0).any():
        raise ValueError(
            "Phat hien nhu cau xuat am. "
            "Hay kiem tra du lieu dau vao."
        )

    duplicate_count = int(
        df.duplicated(
            subset=["ngay"] + GROUP_COLUMNS
        ).sum()
    )

    if duplicate_count > 0:
        raise ValueError(
            f"Phat hien {duplicate_count} dong trung "
            "ngay, kho, san pham. "
            "Can xu ly du lieu truoc khi tao dac trung."
        )

    df = df.sort_values(
        GROUP_COLUMNS + ["ngay"]
    ).reset_index(drop=True)

    return df


def build_continuity_report(df):
    rows = []

    for (warehouse, product), group in df.groupby(
        GROUP_COLUMNS,
        sort=False
    ):
        dates = group["ngay"].sort_values()

        start_date = dates.min()
        end_date = dates.max()

        expected_days = (
            end_date - start_date
        ).days + 1

        actual_days = dates.nunique()

        rows.append({
            "ma_kho": warehouse,
            "ma_sp": product,
            "so_dong": len(group),
            "so_ngay_thuc_te": actual_days,
            "so_ngay_ky_vong": expected_days,
            "so_ngay_thieu": max(
                expected_days - actual_days,
                0
            ),
            "ngay_bat_dau": start_date.date(),
            "ngay_ket_thuc": end_date.date()
        })

    return pd.DataFrame(rows)


def complete_daily_series(df):
    """
    Tao chuoi ngay lien tuc cho tung kho - san pham.

    Chi dien 0 cho nhu cau khi:
    FILL_MISSING_DAYS_WITH_ZERO = True.

    Cac cot ngoai sinh khong tu dong dien 0.
    """
    if not FILL_MISSING_DAYS_WITH_ZERO:
        return df.copy()

    series_parts = []

    for (warehouse, product), group in df.groupby(
        GROUP_COLUMNS,
        sort=False
    ):
        group = group.sort_values("ngay").copy()

        full_dates = pd.date_range(
            start=group["ngay"].min(),
            end=group["ngay"].max(),
            freq="D"
        )

        group = group.set_index("ngay").reindex(
            full_dates
        )

        group.index.name = "ngay"

        group["ma_kho"] = warehouse
        group["ma_sp"] = product

        # Chi dien 0 cho cot muc tieu.
        group[TARGET_COLUMN] = (
            group[TARGET_COLUMN].fillna(0)
        )

        # Cot thoi tiet, lich va kinh te duoc giu NA.
        series_parts.append(group.reset_index())

    result = pd.concat(
        series_parts,
        ignore_index=True
    )

    return result.sort_values(
        GROUP_COLUMNS + ["ngay"]
    ).reset_index(drop=True)


def add_calendar_features(df):
    df = df.copy()

    df["day_of_week"] = df["ngay"].dt.dayofweek
    df["month"] = df["ngay"].dt.month
    df["day_of_month"] = df["ngay"].dt.day
    df["day_of_year"] = df["ngay"].dt.dayofyear

    df["week_of_year"] = (
        df["ngay"].dt.isocalendar().week.astype(int)
    )

    df["is_weekend"] = (
        df["day_of_week"] >= 5
    ).astype(int)

    return df


def add_lag_and_rolling_features(df):
    df = df.copy()

    df = df.sort_values(
        GROUP_COLUMNS + ["ngay"]
    ).reset_index(drop=True)

    grouped = df.groupby(
        GROUP_COLUMNS,
        sort=False
    )[TARGET_COLUMN]

    # Lag: nhu cau tai cac ngay truoc do.
    for lag in LAG_WINDOWS:
        df[f"lag_{lag}"] = grouped.shift(lag)

    # Rolling: chi su dung du lieu truoc ngay du bao.
    for window in ROLLING_WINDOWS:
        df[f"rolling_mean_{window}"] = grouped.transform(
            lambda s: s.shift(1).rolling(
                window=window,
                min_periods=window
            ).mean()
        )

    df["rolling_std_7"] = grouped.transform(
        lambda s: s.shift(1).rolling(
            window=7,
            min_periods=7
        ).std()
    )

    return df


def build_feature_report(df):
    rows = []

    for col in df.columns:
        rows.append({
            "column_name": col,
            "missing_count": int(df[col].isna().sum()),
            "missing_pct": round(
                df[col].isna().mean() * 100,
                2
            ),
            "data_type": str(df[col].dtype)
        })

    return pd.DataFrame(rows)


def main():
    print("=" * 65)
    print("FEATURE ENGINEERING - DU BAO NHU CAU XUAT HANG")
    print("=" * 65)

    df = load_and_validate_data()

    print(f"So dong dau vao: {len(df):,}")
    print(f"So kho: {df['ma_kho'].nunique()}")
    print(f"So san pham: {df['ma_sp'].nunique()}")
    print(
        f"Khoang ngay: {df['ngay'].min().date()} "
        f"den {df['ngay'].max().date()}"
    )

    # Bao cao lien tuc truoc khi xu ly ngay thieu.
    continuity_before = build_continuity_report(df)

    print(
        "Tong so ngay thieu tren cac chuoi kho-san pham: "
        f"{continuity_before['so_ngay_thieu'].sum():,}"
    )

    # Chi bo sung ngay neu da xac nhan gia tri 0 la hop le.
    df = complete_daily_series(df)

    # Tao dac trung lich.
    df = add_calendar_features(df)

    # Tao dac trung tu lich su nhu cau.
    df = add_lag_and_rolling_features(df)

    # Bao cao chat luong sau khi tao dac trung.
    report_df = build_feature_report(df)

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    df.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    report_df.to_csv(
        REPORT_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    continuity_after = build_continuity_report(df)

    continuity_after.to_csv(
        CONTINUITY_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    print("\nHOAN THANH FEATURE ENGINEERING")
    print(f"So dong dau ra: {len(df):,}")
    print(f"So cot dau ra: {len(df.columns)}")
    print(f"\nFile du lieu: {OUTPUT_FILE}")
    print(f"File bao cao: {REPORT_FILE}")
    print(f"File kiem tra chuoi ngay: {CONTINUITY_FILE}")

    feature_columns = [
        "lag_1",
        "lag_7",
        "lag_14",
        "lag_28",
        "rolling_mean_7",
        "rolling_mean_14",
        "rolling_mean_28",
        "rolling_std_7"
    ]

    print("\nSo gia tri thieu cua cac dac trung moi:")
    print(
        df[feature_columns].isna().sum().to_string()
    )

    print("\nThong ke ngay thieu theo chuoi:")
    print(
        continuity_after["so_ngay_thieu"]
        .describe()
        .to_string()
    )

    print("\nNam dong dau tien:")
    print(
        df[
            [
                "ngay",
                "ma_kho",
                "ma_sp",
                TARGET_COLUMN,
                "lag_7",
                "rolling_mean_7"
            ]
        ].head(10).to_string(index=False)
    )

    print("\nTy le gia tri thieu theo cot:")
    print(
        report_df[
            ["column_name", "missing_count", "missing_pct"]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()
