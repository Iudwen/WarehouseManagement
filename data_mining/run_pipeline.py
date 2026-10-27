import csv
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[1]

PIPELINE_STEPS = [
    {
        "step": 1,
        "name": "Trích xuất nhu cầu thực từ PostgreSQL Central",
        "script": BASE_DIR / "data_mining" / "data_preprocessing" / "extract_live_demand.py",
    },
    {
        "step": 2,
        "name": "Làm sạch & chuẩn hóa dữ liệu xuất thô -> Gold",
        "script": BASE_DIR / "data_mining" / "build_gold.py",
    },
    {
        "step": 3,
        "name": "Tiền xử lý chuỗi thời gian & Zero-filling theo ngày",
        "script": BASE_DIR / "data_mining" / "data_preprocessing" / "prepare_demand.py",
    },
    {
        "step": 4,
        "name": "Trích xuất thời tiết lịch sử (Open-Meteo Archive API)",
        "script": BASE_DIR / "data_center" / "etl" / "extract" / "extract_weather_api.py",
    },
    {
        "step": 5,
        "name": "Trích xuất lịch & Ngày nghỉ lễ chính thức Việt Nam",
        "script": BASE_DIR / "data_center" / "etl" / "extract" / "extract_calendar_api.py",
    },
    {
        "step": 6,
        "name": "Tích hợp dữ liệu DB/API -> Analytical Dataset",
        "script": BASE_DIR / "data_mining" / "data_preprocessing" / "build_analytical_dataset.py",
    },
    {
        "step": 7,
        "name": "Phân tích khám phá dữ liệu đa chiều (EDA & Charts)",
        "script": BASE_DIR / "data_mining" / "eda" / "eda_demand.py",
    },
    {
        "step": 8,
        "name": "Tạo đặc trưng, kiểm định thời gian, chọn mô hình và xuất dự báo",
        "script": BASE_DIR / "data_mining" / "models" / "train_forecast.py",
    },
    {
        "step": 9,
        "name": "Huấn luyện & đánh giá dự báo nhu cầu tổng hợp theo tuần",
        "script": BASE_DIR / "data_mining" / "models" / "train_weekly_forecast.py",
    },
    {
        "step": 10,
        "name": "Huấn luyện & đánh giá dự báo tổng nhu cầu 15 và 30 ngày",
        "script": BASE_DIR / "data_mining" / "models" / "train_horizon_forecast.py",
    },
    {
        "step": 11,
        "name": "Phân loại hàng hóa ABC-XYZ & Gợi ý bố trí kho hỗ trợ quyết định",
        "script": BASE_DIR / "data_mining" / "decision_support" / "abc_xyz_analysis.py",
    },
    {
        "step": 12,
        "name": "Khai phá luật kết hợp Apriori (Market Basket) & Gợi ý gom cụm picking",
        "script": BASE_DIR / "data_mining" / "decision_support" / "market_basket_analysis.py",
    },
    {
        "step": 13,
        "name": "Cân bằng tồn kho & Đề xuất điều chuyển liên kho hỗ trợ quyết định (DSS)",
        "script": BASE_DIR / "data_mining" / "decision_support" / "transfer_recommendation.py",
    },
    {
        "step": 14,
        "name": "Cập nhật dữ liệu biểu đồ Data Mining trên Superset",
        "script": BASE_DIR / "data_mining" / "publish_superset_data.py",
    },
]


def run_pipeline():
    start_time = time.time()
    print("================================================================================")
    print("KHỞI CHẠY PIPELINE DATA MINING TỪ DB/API & HỖ TRỢ QUYẾT ĐỊNH KHO (14 BƯỚC)")
    print("Dự Án: Distributed Warehouse Management System")
    print("================================================================================\n")

    total_steps = len(PIPELINE_STEPS)
    executed_steps = []

    for step_info in PIPELINE_STEPS:
        step = step_info["step"]
        name = step_info["name"]
        script = step_info["script"]

        print(f"\n>>> [BƯỚC {step}/{total_steps}] {name}")
        print(f"    Thực thi: py {script.relative_to(BASE_DIR)}")

        step_start = time.time()

        if not script.exists():
            print(f"    [LỖI NGHIÊM TRỌNG] Không tìm thấy file script: {script}")
            sys.exit(1)

        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(BASE_DIR),
            capture_output=False,
            text=True,
        )

        step_duration = round(time.time() - step_start, 2)

        if result.returncode != 0:
            print(f"\n[THẤT BẠI] Bước {step} thất bại với mã lỗi {result.returncode} sau {step_duration}s.")
            sys.exit(result.returncode)

        print(f"    [THÀNH CÔNG] Hoàn tất bước {step} trong {step_duration}s.")
        executed_steps.append({
            "step": step,
            "name": name,
            "duration_sec": step_duration,
            "status": "SUCCESS"
        })

    total_time = round(time.time() - start_time, 2)
    print("\n================================================================================")
    print(f"[HOÀN TẤT THÀNH CÔNG] Hoàn tất toàn bộ pipeline trong {total_time} giây")
    print(f"HOÀN TẤT TOÀN BỘ PIPELINE THÀNH CÔNG TRONG {total_time} GIÂY")
    print("Các dữ liệu đầu ra chính:")
    print("  1. Nhu cầu nguồn DB:           data_mining/datasets/raw/lich_su_xuat_hang.csv")
    print("  2. Analytical Dataset:         data_mining/datasets/gold/analytical_dataset.csv")
    print("  3. Kết quả dự báo (ML):        data_mining/datasets/gold/forecast_results.csv")
    print("  4. Báo cáo đánh giá ML:        data_mining/evaluation_report.md")
    print("  5. Dự báo tổng hợp theo tuần:  data_mining/datasets/gold/weekly_forecast_results.csv")
    print("  6. Báo cáo dự báo tuần:        data_mining/weekly_evaluation_report.md")
    print("  7. Dự báo tuần kế tiếp (nếu dữ liệu mới): data_mining/datasets/gold/weekly_next_forecast.csv")
    print("  8. Holdout tổng nhu cầu 15/30 ngày: data_mining/datasets/gold/horizon_forecast_results.csv")
    print("  9. Dự báo live tổng 15/30 ngày: data_mining/datasets/gold/horizon_next_forecast.csv")
    print(" 10. Phân tích ABC-XYZ:          data_mining/datasets/gold/abc_xyz_analysis.json")
    print(" 11. Phân tích giỏ hàng:         data_mining/datasets/gold/market_basket_rules.json")
    print(" 12. Đề xuất điều chuyển kho:    data_mining/datasets/gold/transfer_recommendations.json")
    print("================================================================================")

    forecast_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "forecast_results.csv"
    )
    model_selection_file = (
        BASE_DIR
        / "data_mining"
        / "models"
        / "model_registry"
        / "primary_model.json"
    )
    forecast_errors = {"du_bao_primary": [], "du_bao_lgb": []}
    actual_total = 0.0
    with forecast_file.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            actual = float(row["thuc_te"])
            actual_total += abs(actual)
            for prediction_column in forecast_errors:
                forecast_errors[prediction_column].append(
                    abs(actual - float(row[prediction_column]))
                )

    if not forecast_errors["du_bao_primary"]:
        raise ValueError(f"Không có dự báo trong file: {forecast_file}")

    with model_selection_file.open("r", encoding="utf-8") as f:
        model_selection = json.load(f)

    transfer_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "transfer_recommendations.json"
    )
    with transfer_file.open("r", encoding="utf-8") as f:
        transfer_summary = json.load(f)

    abc_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "abc_xyz_analysis.json"
    )
    with abc_file.open("r", encoding="utf-8") as f:
        abc_summary = json.load(f)

    association_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "market_basket_rules.json"
    )
    with association_file.open("r", encoding="utf-8") as f:
        association_summary = json.load(f)

    primary_mae = sum(forecast_errors["du_bao_primary"]) / len(
        forecast_errors["du_bao_primary"]
    )
    lightgbm_mae = sum(forecast_errors["du_bao_lgb"]) / len(
        forecast_errors["du_bao_lgb"]
    )
    primary_wape = (
        sum(forecast_errors["du_bao_primary"]) / actual_total * 100
        if actual_total > 0
        else None
    )

    analytical_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "analytical_dataset.csv"
    )
    with analytical_file.open("r", encoding="utf-8-sig", newline="") as f:
        analytical_rows = sum(1 for _ in csv.DictReader(f))
    with forecast_file.open("r", encoding="utf-8-sig", newline="") as f:
        test_rows = sum(1 for _ in csv.DictReader(f))
    extraction_status_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "live_db_extract_status.json"
    )
    with extraction_status_file.open("r", encoding="utf-8") as f:
        extraction_status = json.load(f)
    horizon_metadata_file = (
        BASE_DIR
        / "data_mining"
        / "models"
        / "model_registry"
        / "horizon_models.json"
    )
    with horizon_metadata_file.open("r", encoding="utf-8") as f:
        horizon_metadata = json.load(f)
    horizon_status_file = (
        BASE_DIR
        / "data_mining"
        / "datasets"
        / "gold"
        / "horizon_live_forecast_status.json"
    )
    with horizon_status_file.open("r", encoding="utf-8") as f:
        horizon_status = json.load(f)

    # Lưu trạng thái pipeline để backend API có thể truy xuất metadata
    status_file = BASE_DIR / "data_mining" / "datasets" / "gold" / "pipeline_run_status.json"
    status_data = {
        "status": "COMPLETED",
        "last_run": datetime.now().isoformat(),
        "total_duration_sec": total_time,
        "data_source": extraction_status,
        "steps": executed_steps,
        "metrics": {
            "analytical_rows": analytical_rows,
            "test_rows": test_rows,
            "best_model": model_selection["model_name"],
            "best_mae": round(primary_mae, 4),
            "lightgbm_mae": round(lightgbm_mae, 4),
            "primary_wape_percent": (
                round(primary_wape, 4)
                if primary_wape is not None
                else None
            ),
            "accuracy_100_minus_wape_percent": (
                round(100 - primary_wape, 4)
                if primary_wape is not None
                else None
            ),
            "accuracy_over_90_percent": (
                primary_wape is not None and 100 - primary_wape > 90
            ),
            "horizon_15_day_wape_percent": round(
                horizon_metadata["horizons"]["15"]["holdout_metrics"][
                    horizon_metadata["horizons"]["15"]["selected_model"]
                ]["wape_percent"],
                4,
            ),
            "horizon_30_day_wape_percent": round(
                horizon_metadata["horizons"]["30"]["holdout_metrics"][
                    horizon_metadata["horizons"]["30"]["selected_model"]
                ]["wape_percent"],
                4,
            ),
            "horizon_live_forecast_status": horizon_status["status"],
            "abc_items": len(abc_summary["items"]),
            "association_rules": len(association_summary["rules"]),
            "transfer_recommendations": transfer_summary["tong_so_de_xuat"]
        }
    }
    with status_file.open("w", encoding="utf-8") as f:
        json.dump(status_data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    run_pipeline()
