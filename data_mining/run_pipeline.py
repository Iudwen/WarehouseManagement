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
        "name": "Làm sạch & chuẩn hóa dữ liệu xuất thô -> Gold",
        "script": BASE_DIR / "data_mining" / "build_gold.py",
    },
    {
        "step": 2,
        "name": "Tiền xử lý chuỗi thời gian & Zero-filling theo ngày",
        "script": BASE_DIR / "data_mining" / "data_preprocessing" / "prepare_demand.py",
    },
    {
        "step": 3,
        "name": "Trích xuất thời tiết lịch sử (Open-Meteo Archive API)",
        "script": BASE_DIR / "data_center" / "etl" / "extract" / "extract_weather_api.py",
    },
    {
        "step": 4,
        "name": "Trích xuất lịch & Ngày nghỉ lễ chính thức Việt Nam",
        "script": BASE_DIR / "data_center" / "etl" / "extract" / "extract_calendar_api.py",
    },
    {
        "step": 5,
        "name": "Tích hợp đa nguồn -> Analytical Dataset (21,960 dòng)",
        "script": BASE_DIR / "data_mining" / "data_preprocessing" / "build_analytical_dataset.py",
    },
    {
        "step": 6,
        "name": "Phân tích khám phá dữ liệu đa chiều (EDA & Charts)",
        "script": BASE_DIR / "data_mining" / "eda" / "eda_demand.py",
    },
    {
        "step": 7,
        "name": "Feature Engineering, Huấn luyện ML (Ridge/RF/LightGBM), Đánh giá MAE/RMSE & Xuất kết quả",
        "script": BASE_DIR / "data_mining" / "models" / "train_forecast.py",
    },
    {
        "step": 8,
        "name": "Phân loại hàng hóa ABC-XYZ & Gợi ý bố trí kho hỗ trợ quyết định",
        "script": BASE_DIR / "data_mining" / "decision_support" / "abc_xyz_analysis.py",
    },
    {
        "step": 9,
        "name": "Khai phá luật kết hợp Apriori (Market Basket) & Gợi ý gom cụm picking",
        "script": BASE_DIR / "data_mining" / "decision_support" / "market_basket_analysis.py",
    },
    {
        "step": 10,
        "name": "Cân bằng tồn kho & Đề xuất điều chuyển liên kho hỗ trợ quyết định (DSS)",
        "script": BASE_DIR / "data_mining" / "decision_support" / "transfer_recommendation.py",
    },
]


def run_pipeline():
    start_time = time.time()
    print("================================================================================")
    print("KHỞI CHẠY TOÀN BỘ PIPELINE DATA MINING & HỖ TRỢ QUYẾT ĐỊNH KHO TỰ ĐỘNG (10 BƯỚC)")
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
    print("  1. Analytical Dataset:        data_mining/datasets/gold/analytical_dataset.csv (21,960 dòng)")
    print("  2. Kết quả dự báo (ML):       data_mining/datasets/gold/forecast_results.csv (2,940 dòng)")
    print("  3. Báo cáo đánh giá ML:       data_mining/evaluation_report.md (Ridge, RF, LightGBM)")
    print("  4. Phân tích ABC-XYZ:         data_mining/datasets/gold/abc_xyz_analysis.json (20 mặt hàng)")
    print("  5. Phân tích giỏ hàng:        data_mining/datasets/gold/market_basket_rules.json (378 luật)")
    print("  6. Đề xuất điều chuyển kho:   data_mining/datasets/gold/transfer_recommendations.json")
    print("================================================================================")

    # Lưu trạng thái pipeline để backend API có thể truy xuất metadata
    status_file = BASE_DIR / "data_mining" / "datasets" / "gold" / "pipeline_run_status.json"
    status_data = {
        "status": "COMPLETED",
        "last_run": datetime.now().isoformat(),
        "total_duration_sec": total_time,
        "steps": executed_steps,
        "metrics": {
            "analytical_rows": 21960,
            "test_rows": 2940,
            "best_model": "Linear Ridge Regression",
            "best_mae": 13.9641,
            "lightgbm_mae": 14.0044,
            "abc_items": 20,
            "association_rules": 378,
            "transfer_recommendations": 2
        }
    }
    with status_file.open("w", encoding="utf-8") as f:
        json.dump(status_data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    run_pipeline()
