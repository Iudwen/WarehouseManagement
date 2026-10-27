import json
import tempfile
import unittest
import numpy as np
import pandas as pd
from pathlib import Path
import joblib
from unittest.mock import MagicMock, patch

BASE_DIR = Path(__file__).resolve().parents[2]
GOLD_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
ABC_XYZ_FILE = GOLD_DIR / "abc_xyz_analysis.json"
MARKET_BASKET_FILE = GOLD_DIR / "market_basket_rules.json"
FORECAST_FILE = GOLD_DIR / "forecast_results.csv"
MODEL_REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"


class TestAbcXyzDecisionSupport(unittest.TestCase):
    """
    Bộ kiểm thử cho Hạng mục A: Phân loại ABC-XYZ và gợi ý bố trí kho.
    """

    def setUp(self):
        self.assertTrue(ABC_XYZ_FILE.exists(), f"Không tìm thấy file kết quả ABC-XYZ: {ABC_XYZ_FILE}")
        with ABC_XYZ_FILE.open("r", encoding="utf-8") as f:
            self.data = json.load(f)

    def test_abc_item_count_and_fields(self):
        """Kiểm tra phân loại đủ 20 sản phẩm và có đầy đủ các trường thông tin chuẩn mực."""
        items = self.data.get("items", [])
        self.assertEqual(len(items), 20, f"Dự kiến 20 sản phẩm nhưng có {len(items)}")

        required_fields = [
            "ma_sp", "ten_sp", "gia_ban", "tong_so_luong", "tong_gia_tri",
            "ty_le_gia_tri", "ty_le_tich_luy", "so_phieu_xuat", "so_dong_xuat",
            "nhom_abc", "mean_daily", "std_daily", "cv", "zero_pct", "nhom_xyz",
            "nhom_abc_xyz", "muc_uu_tien", "nguyen_tac_bo_tri", "chinh_sach_ton_kho",
            "ly_do_de_xuat", "kho_ap_dung"
        ]
        for item in items:
            for field in required_fields:
                self.assertIn(field, item, f"Sản phẩm {item.get('ma_sp')} thiếu trường {field}")

    def test_abc_pareto_ranking_and_boundaries(self):
        """Kiểm tra thứ tự xếp hạng Pareto và ngưỡng phân bổ A (<=80%), B (<=95%), C (>95%)."""
        items = self.data.get("items", [])
        prev_cum = 0.0
        for item in items:
            cum = item["ty_le_tich_luy"]
            self.assertGreaterEqual(cum, prev_cum, "Tỷ lệ tích lũy phải tăng dần (đã sort giảm dần theo doanh thu)")
            prev_cum = cum

            # Kiểm tra gán nhãn ABC đúng theo lũy kế
            if cum <= 80.0:
                self.assertEqual(item["nhom_abc"], "A", f"Sản phẩm {item['ma_sp']} cum={cum}% phải là A")
            elif cum <= 95.0:
                self.assertIn(item["nhom_abc"], ["A", "B"])
            else:
                self.assertIn(item["nhom_abc"], ["B", "C"])

    def test_xyz_cv_stability_logic(self):
        """Kiểm tra chỉ số biến động CV không âm và phân loại X (CV <= 0.65), Y (0.65 < CV <= 0.75), Z (CV > 0.75)."""
        items = self.data.get("items", [])
        for item in items:
            cv = item["cv"]
            self.assertGreaterEqual(cv, 0.0, "CV không được âm")
            if cv <= 0.65:
                self.assertEqual(item["nhom_xyz"], "X")
            elif cv <= 0.75:
                self.assertEqual(item["nhom_xyz"], "Y")
            else:
                self.assertEqual(item["nhom_xyz"], "Z")

    def test_warehouse_layout_advice_principles(self):
        """Kiểm tra gợi ý bố trí chỉ dựa trên nguyên tắc logistics, không bịa đặt tọa độ 3D kệ."""
        items = self.data.get("items", [])
        for item in items:
            advice = item["nguyen_tac_bo_tri"]
            self.assertTrue(len(advice) > 0, "Gợi ý bố trí không được rỗng")
            # Không bịa tọa độ x, y, z hay tầng kệ khi database chưa có
            self.assertNotIn("tọa độ x=", advice.lower())
            self.assertNotIn("kệ số", advice.lower())

    def test_warehouse_filtering_isolation(self):
        """Kiểm tra việc sinh kết quả riêng biệt cho từng kho (HN01, DN01, HCM01)."""
        for kho in ["HN01", "DN01", "HCM01"]:
            kho_file = GOLD_DIR / f"abc_xyz_analysis_{kho}.json"
            self.assertTrue(kho_file.exists(), f"Thiếu file ABC-XYZ riêng cho kho {kho}")
            with kho_file.open("r", encoding="utf-8") as f:
                kho_data = json.load(f)
            self.assertEqual(kho_data.get("kho_ap_dung"), kho)
            self.assertEqual(len(kho_data.get("items", [])), 20)


class TestMarketBasketApriori(unittest.TestCase):
    """
    Bộ kiểm thử cho Hạng mục B: Khai phá luật kết hợp Apriori và gợi ý picking.
    """

    def setUp(self):
        self.assertTrue(MARKET_BASKET_FILE.exists(), f"Không tìm thấy file luật kết hợp: {MARKET_BASKET_FILE}")
        with MARKET_BASKET_FILE.open("r", encoding="utf-8") as f:
            self.data = json.load(f)

    def test_market_basket_structure_and_transactions(self):
        """Kiểm tra tổng số phiếu xuất được phân tích (> 10,000 phiếu xuất hợp lệ)."""
        total_transactions = self.data.get("tong_so_giao_dich", 0)
        self.assertGreater(total_transactions, 10000, "Tổng số giao dịch phân tích phải > 10,000 phiếu xuất thật")
        self.assertGreater(len(self.data.get("rules", [])), 0, "Phải khai phá được ít nhất 1 luật kết hợp")

    def test_rule_metrics_mathematical_validity(self):
        """Kiểm tra các chỉ số Support, Confidence, Lift nằm đúng trong miền giá trị toán học."""
        rules = self.data.get("rules", [])
        total_tx = self.data.get("tong_so_giao_dich")
        for r in rules:
            self.assertGreater(r["support"], 0.0)
            self.assertLessEqual(r["support"], 1.0)
            self.assertGreater(r["confidence"], 0.0)
            self.assertLessEqual(r["confidence"], 1.0)
            self.assertGreater(r["lift"], 0.0)
            self.assertGreater(r["transaction_count"], 0)
            self.assertLessEqual(r["transaction_count"], total_tx)
            # Support = transaction_count / total_transactions (sai số chấp nhận 1e-4)
            calc_supp = r["transaction_count"] / total_tx
            self.assertAlmostEqual(r["support"], calc_supp, places=4)

    def test_top_co_occurring_pairs_and_picking_clusters(self):
        """Kiểm tra danh sách top cặp sản phẩm và gợi ý gom cụm picking hợp lý."""
        top_pairs = self.data.get("top_picking_pairs", [])
        self.assertGreater(len(top_pairs), 0, "Phải có danh sách top cặp sản phẩm đồng xuất hiện")
        prev_count = 999999
        for p in top_pairs:
            count = p["transaction_count"]
            self.assertLessEqual(count, prev_count, "Top pairs phải được sắp xếp giảm dần theo số lần xuất chung")
            prev_count = count
            self.assertIn("de_xuat_picking", p)


class TestLightGbmTimeSeriesForecast(unittest.TestCase):
    """
    Bộ kiểm thử cho Hạng mục C: Kiểm thử mô hình LightGBM chuỗi thời gian.
    """

    def setUp(self):
        self.assertTrue(FORECAST_FILE.exists(), f"Không tìm thấy file kết quả dự báo: {FORECAST_FILE}")
        self.df_forecast = pd.read_csv(FORECAST_FILE)
        self.lgb_model_path = MODEL_REGISTRY_DIR / "lgb_model.joblib"

    def test_lightgbm_model_saved_and_loadable(self):
        """Kiểm tra file mô hình LightGBM trong model registry có thể load và suy luận."""
        self.assertTrue(self.lgb_model_path.exists(), f"Thiếu file model registry: {self.lgb_model_path}")
        model = joblib.load(self.lgb_model_path)
        self.assertIsNotNone(model)
        self.assertTrue(hasattr(model, "predict"), "Mô hình LightGBM phải có phương thức predict()")

    def test_forecast_results_contain_lightgbm(self):
        """Kiểm tra file forecast_results.csv có cột du_bao_lgb và không có giá trị âm hoặc NaN."""
        self.assertIn("du_bao_lgb", self.df_forecast.columns, "Bảng dự báo phải chứa cột du_bao_lgb")
        analytical = pd.read_csv(
            GOLD_DIR / "analytical_dataset.csv",
            encoding="utf-8-sig",
        )
        feature_days = len(pd.unique(pd.to_datetime(analytical["ngay"]))) - 7
        pair_count = analytical[["ma_kho", "ma_sp"]].drop_duplicates().shape[0]
        expected_rows = int(np.ceil(feature_days * 0.20)) * pair_count
        self.assertEqual(len(self.df_forecast), expected_rows)
        # Không có NaN
        self.assertEqual(self.df_forecast["du_bao_lgb"].isna().sum(), 0, "Cột du_bao_lgb không được chứa NaN")
        # Không có giá trị âm
        self.assertEqual((self.df_forecast["du_bao_lgb"] < 0).sum(), 0, "Dự báo của LightGBM không được âm")

    def test_lightgbm_mae_and_rmse_metrics(self):
        """Kiểm tra dự báo LightGBM không âm và tốt hơn baseline trên cùng tập test."""
        y_true = self.df_forecast["thuc_te"].values
        y_pred = self.df_forecast["du_bao_lgb"].values
        mae = np.mean(np.abs(y_true - y_pred))
        rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))

        y_base = self.df_forecast["du_bao_baseline"].values
        mae_base = np.mean(np.abs(y_true - y_base))
        rmse_base = np.sqrt(np.mean((y_true - y_base) ** 2))
        self.assertLess(mae, mae_base, "LightGBM phải có MAE thấp hơn Baseline!")
        self.assertLess(rmse, rmse_base, "LightGBM phải có RMSE thấp hơn Baseline!")

    def test_primary_gradient_boosting_is_saved_and_used(self):
        model_path = MODEL_REGISTRY_DIR / "gradient_boosting_model.joblib"
        selection_path = MODEL_REGISTRY_DIR / "primary_model.json"

        self.assertTrue(model_path.exists(), "Thiếu Gradient Boosting model trong registry")
        self.assertTrue(selection_path.exists(), "Thiếu metadata chọn mô hình chính")
        self.assertTrue(
            (MODEL_REGISTRY_DIR / "feature_columns.joblib").exists(),
            "Thiếu danh sách đặc trưng theo đúng thứ tự trong Model Registry",
        )
        self.assertIn("du_bao_primary", self.df_forecast.columns)
        self.assertIn("du_bao_gradient_boosting", self.df_forecast.columns)
        self.assertEqual(self.df_forecast["du_bao_primary"].isna().sum(), 0)
        self.assertEqual((self.df_forecast["du_bao_primary"] < 0).sum(), 0)

        with selection_path.open("r", encoding="utf-8") as f:
            selection = json.load(f)

        self.assertEqual(
            selection["model_name"],
            "Gradient Boosting (absolute_error)",
        )
        self.assertLess(
            selection["validation_mae"]["Gradient Boosting (absolute_error)"],
            selection["validation_mae"]["Ridge Regression"],
        )
        self.assertGreaterEqual(
            selection["prediction_calibration_scale"],
            0.5,
        )
        self.assertLessEqual(
            selection["prediction_calibration_scale"],
            1.5,
        )
        self.assertEqual(selection["production_training_rows"], 21_540)
        self.assertEqual(
            selection["production_training_end_date"],
            "2026-09-18",
        )
        np.testing.assert_allclose(
            self.df_forecast["du_bao_primary"],
            np.round(
                self.df_forecast["du_bao_gradient_boosting"]
                * selection["prediction_calibration_scale"],
                2,
            ),
            atol=0.011,
        )



class TestTransferRecommendations(unittest.TestCase):
    """
    Bộ kiểm thử cho Hạng mục Đề xuất điều chuyển hàng liên kho (Transfer Recommendations DSS).
    """

    def setUp(self):
        self.json_file = GOLD_DIR / "transfer_recommendations.json"
        self.csv_file = GOLD_DIR / "transfer_recommendations.csv"
        self.lake_json = BASE_DIR / "data_center" / "data_lake" / "gold" / "transfer_recommendations.json"

    def test_transfer_files_exist(self):
        """Kiểm tra các file đề xuất điều chuyển được đồng bộ ra cả Gold Dataset và Data Lake Gold."""
        self.assertTrue(self.json_file.exists(), f"Thiếu file: {self.json_file}")
        self.assertTrue(self.csv_file.exists(), f"Thiếu file: {self.csv_file}")
        self.assertTrue(self.lake_json.exists(), f"Thiếu file trong Data Lake Gold: {self.lake_json}")

    def test_transfer_logic_and_constraints(self):
        """Kiểm tra tính hợp lệ nghiệp vụ của các đề xuất điều chuyển."""
        with self.json_file.open("r", encoding="utf-8") as f:
            data = json.load(f)

        items = data.get("items", [])
        self.assertEqual(
            data.get("tong_so_de_xuat"),
            len(items),
            "Số đề xuất trong summary phải khớp số item",
        )
        if not items:
            self.assertEqual(data.get("tong_gia_tri_uoc_tinh"), 0)
            return

        for rec in items:
            # Kho nguồn và đích không trùng nhau
            self.assertNotEqual(rec["kho_nguon"], rec["kho_dich"], "Kho nguồn và kho đích không được trùng nhau")
            # Số lượng điều chuyển dương
            self.assertGreater(rec["so_luong_de_xuat"], 0, "Số lượng đề xuất phải > 0")
            # Kho nguồn phải có đủ hàng để điều chuyển
            self.assertGreaterEqual(rec["ton_kho_nguon"], rec["so_luong_de_xuat"], "Kho nguồn phải đủ hàng khả dụng")
            # Mức ưu tiên hợp lệ
            self.assertIn(rec["priority_code"], ["HIGH", "MEDIUM", "LOW"])
            # Căn cứ thuật toán chi tiết
            self.assertTrue(len(rec["can_cu_de_xuat"]) > 20, "Căn cứ đề xuất phải diễn giải chi tiết")

    def test_blocked_live_forecast_produces_no_transfer_recommendations(self):
        from data_mining.decision_support import transfer_recommendation as transfer

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            status_file = temp_root / "weekly_live_forecast_status.json"
            status_file.write_text(
                json.dumps({
                    "status": "BLOCKED_SOURCE_NOT_READY",
                    "source_age_days": 39,
                    "reason": "Source data is stale.",
                }),
                encoding="utf-8",
            )
            gold_dir = temp_root / "gold"
            lake_gold_dir = temp_root / "lake_gold"
            with (
                patch.object(transfer, "WEEKLY_FORECAST_STATUS_FILE", status_file),
                patch.object(transfer, "GOLD_DIR", gold_dir),
                patch.object(transfer, "DATA_LAKE_GOLD_DIR", lake_gold_dir),
            ):
                result = transfer.run_transfer_recommendations("ALL")

            self.assertEqual(result["status"], "BLOCKED_FORECAST_DATA")
            self.assertEqual(result["items"], [])
            self.assertEqual(
                result["inventory_analysis_status"],
                "BLOCKED_FORECAST_DATA",
            )
            self.assertEqual(result["inventory_analysis"], [])
            self.assertIn("Source data is stale.", result["ghi_chu_nghiep_vu"])
            self.assertTrue((gold_dir / "transfer_recommendations.csv").exists())
            self.assertEqual(
                json.loads((lake_gold_dir / "transfer_recommendations.json").read_text(
                    encoding="utf-8"
                )),
                result,
            )

    def test_fetch_approved_export_commitments_reads_all_nodes(self):
        from data_mining.decision_support import transfer_recommendation as transfer

        node_rows = [
            [("HN01", "SP001", 12)],
            [("DN01", "SP001", 8)],
            [("HCM01", "SP002", 4)],
        ]
        connections = []

        def connect_node(**_config):
            connection = MagicMock()
            cursor = MagicMock()
            cursor.fetchall.return_value = node_rows[len(connections)]
            connection.cursor.return_value.__enter__.return_value = cursor
            connection.__enter__.return_value = connection
            connections.append(connection)
            return connection

        with (
            patch.object(transfer.psycopg, "connect", side_effect=connect_node),
            patch.dict("os.environ", {}, clear=True),
        ):
            commitments = transfer.fetch_approved_export_commitments()

        self.assertEqual(len(connections), 3)
        self.assertEqual(
            commitments.to_dict(orient="records"),
            [
                {
                    "ma_kho": "HN01",
                    "ma_sp": "SP001",
                    "so_luong_da_duyet_chua_xuat": 12,
                },
                {
                    "ma_kho": "DN01",
                    "ma_sp": "SP001",
                    "so_luong_da_duyet_chua_xuat": 8,
                },
                {
                    "ma_kho": "HCM01",
                    "ma_sp": "SP002",
                    "so_luong_da_duyet_chua_xuat": 4,
                },
            ],
        )
        for connection in connections:
            connection.cursor.return_value.__enter__.return_value.execute.assert_called_once()
            query = connection.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
            self.assertIn("px.trang_thai = 'DA_DUYET'", query)

    def test_ready_recommendations_use_weekly_live_forecast_not_historical_holdout(self):
        from data_mining.decision_support import transfer_recommendation as transfer

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            status_file = temp_root / "weekly_live_forecast_status.json"
            status_file.write_text(
                json.dumps({
                    "status": "READY",
                    "source_age_days": 0,
                    "forecast_start_week": "2026-09-21",
                    "forecast_end_week": "2026-09-27",
                }),
                encoding="utf-8",
            )
            stock_file = temp_root / "stock.csv"
            pd.DataFrame([
                {"ma_kho": "HN01", "ma_sp": "SP001", "so_luong": 160},
                {"ma_kho": "DN01", "ma_sp": "SP001", "so_luong": 0},
            ]).to_csv(stock_file, index=False)
            weekly_forecast_file = temp_root / "weekly_next_forecast.csv"
            pd.DataFrame([
                {
                    "ma_kho": warehouse,
                    "ma_sp": "SP001",
                    "tuan_bat_dau": "2026-09-21",
                    "tuan_ket_thuc": "2026-09-27",
                    "du_bao_nhu_cau_tuan": 70,
                }
                for warehouse in ["HN01", "DN01"]
            ]).to_csv(weekly_forecast_file, index=False)
            products_file = temp_root / "products.csv"
            pd.DataFrame([{
                "ma_sp": "SP001",
                "ten_sp": "Test product",
                "gia_ban": 10,
                "don_vi_tinh": "cái",
            }]).to_csv(products_file, index=False)
            abc_file = temp_root / "abc.json"
            abc_file.write_text(
                json.dumps({
                    "items": [{
                        "ma_sp": "SP001",
                        "nhom_abc": "B",
                        "nhom_xyz": "X",
                        "nhom_abc_xyz": "BX",
                    }],
                }),
                encoding="utf-8",
            )
            gold_dir = temp_root / "gold"
            lake_gold_dir = temp_root / "lake_gold"

            with (
                patch.object(transfer, "WEEKLY_FORECAST_STATUS_FILE", status_file),
                patch.object(transfer, "WEEKLY_FORECAST_FILE", weekly_forecast_file),
                patch.object(transfer, "TON_KHO_FILE", stock_file),
                patch.object(
                    transfer,
                    "fetch_approved_export_commitments",
                    return_value=pd.DataFrame([
                        {
                            "ma_kho": "HN01",
                            "ma_sp": "SP001",
                            "so_luong_da_duyet_chua_xuat": 20,
                        },
                    ]),
                ),
                patch.object(transfer, "SP_FILE", products_file),
                patch.object(transfer, "ABC_FILE", abc_file),
                patch.object(transfer, "GOLD_DIR", gold_dir),
                patch.object(transfer, "DATA_LAKE_GOLD_DIR", lake_gold_dir),
            ):
                result = transfer.run_transfer_recommendations("ALL")

            self.assertEqual(result["status"], "READY")
            self.assertEqual(result["forecast_source"], "weekly_next_forecast.csv")
            self.assertEqual(len(result["items"]), 1)
            self.assertEqual(result["items"][0]["so_luong_de_xuat"], 40)
            self.assertEqual(result["items"][0]["ton_kho_nguon"], 160)
            self.assertEqual(result["items"][0]["ton_kho_kha_dung_nguon"], 140)
            self.assertEqual(
                result["items"][0]["so_luong_da_duyet_chua_xuat_nguon"],
                20,
            )
            self.assertEqual(result["inventory_analysis_status"], "READY")
            analysis_by_warehouse = {
                row["ma_kho"]: row for row in result["inventory_analysis"]
            }
            self.assertEqual(len(analysis_by_warehouse), 2)
            self.assertEqual(
                analysis_by_warehouse["HN01"]["ton_kho_kha_dung"],
                140,
            )
            self.assertEqual(
                analysis_by_warehouse["HN01"]["so_luong_du_co_the_dieu_chuyen"],
                40,
            )
            self.assertEqual(
                analysis_by_warehouse["DN01"]["so_luong_can_bo_sung"],
                100,
            )


    def test_regression_single_source_multiple_destinations_pool_limit(self):
        """
        [KIỂM THỬ HỒI QUY] Tình huống 1 kho nguồn dư 20, 2 kho nhận mỗi kho thiếu 15.
        Tổng lượng đề xuất rút từ nguồn tuyệt đối KHÔNG được vượt quá 20 sp.
        """
        from data_mining.decision_support.transfer_recommendation import compute_transfer_pairs

        # Tạo DataFrame kiểm chứng
        df_scenario = pd.DataFrame([
            {"ma_sp": "SP_REG_01", "ma_kho": "HN01", "so_luong": 100, "target_stock": 80, "surplus": 20, "dos": 25.0},
            {"ma_sp": "SP_REG_01", "ma_kho": "DN01", "so_luong": 35,  "target_stock": 50, "surplus": -15, "dos": 7.0},
            {"ma_sp": "SP_REG_01", "ma_kho": "HCM01", "so_luong": 35, "target_stock": 50, "surplus": -15, "dos": 7.0},
        ])

        recs = compute_transfer_pairs(df_scenario)
        self.assertGreater(len(recs), 0, "Phải sinh ra các đề xuất điều chuyển")

        # Tính tổng lượng đề xuất lấy từ kho nguồn HN01
        total_from_hn = sum(r["so_luong_de_xuat"] for r in recs if r["kho_nguon"] == "HN01")

        # BẤT BIẾN CỐT LÕI: Tổng rút từ HN01 phải <= 20 sp (thặng dư ban đầu)
        self.assertLessEqual(
            total_from_hn, 20,
            f"LỖI OVER-ALLOCATION: Tổng lượng rút ({total_from_hn}) vượt quá thặng dư của HN01 (20)!"
        )
        self.assertEqual(
            total_from_hn, 20,
            "Với logic tối ưu bội số 5, đề xuất phải phân bổ đúng 15 cho DN01 và 5 cho HCM01 (tổng = 20)"
        )

        # Kiểm tra từng đề xuất cụ thể
        self.assertEqual(len(recs), 2, "Phải có 2 đề xuất điều chuyển")
        self.assertEqual(recs[0]["kho_dich"], "DN01")
        self.assertEqual(recs[0]["so_luong_de_xuat"], 15)
        self.assertEqual(recs[1]["kho_dich"], "HCM01")
        self.assertEqual(recs[1]["so_luong_de_xuat"], 5)

    def test_transfer_rounding_never_exceeds_available_need(self):
        from data_mining.decision_support.transfer_recommendation import compute_transfer_pairs

        scenario = pd.DataFrame([
            {
                "ma_sp": "SP_ROUND",
                "ma_kho": "SOURCE",
                "so_luong": 112,
                "ton_kho_kha_dung": 112,
                "target_stock": 100,
                "surplus": 12,
                "dos": 20,
            },
            {
                "ma_sp": "SP_ROUND",
                "ma_kho": "DEST",
                "so_luong": 0,
                "ton_kho_kha_dung": 0,
                "target_stock": 100,
                "surplus": -100,
                "dos": 0,
            },
        ])

        recommendations = compute_transfer_pairs(scenario)

        self.assertEqual(len(recommendations), 1)
        self.assertEqual(recommendations[0]["so_luong_de_xuat"], 10)
        self.assertLessEqual(
            recommendations[0]["so_luong_de_xuat"],
            scenario.loc[scenario["ma_kho"] == "SOURCE", "surplus"].iloc[0],
        )

    def test_inventory_analysis_reports_overcommitted_stock(self):
        from data_mining.decision_support.transfer_recommendation import build_inventory_analysis

        analysis = build_inventory_analysis(pd.DataFrame([{
            "ma_kho": "HN01",
            "ma_sp": "SP001",
            "so_luong": 10,
            "so_luong_da_duyet_chua_xuat": 15,
            "ton_kho_kha_dung": 0,
            "demand_per_day": 2,
            "safety_days": 5,
            "target_stock": 10,
            "surplus": -15,
        }]))

        self.assertEqual(len(analysis), 1)
        self.assertEqual(analysis[0]["trang_thai_ton"], "OVERCOMMITTED")
        self.assertEqual(analysis[0]["so_luong_cam_ket_vuot_ton"], 5)
        self.assertEqual(analysis[0]["so_luong_can_bo_sung"], 15)

    def test_multiple_sources_and_destinations_invariants(self):
        """
        [KIỂM THỬ MỞ RỘNG] Trường hợp nhiều kho nguồn và nhiều kho nhận:
        Nguồn: S1 (dư 15), S2 (dư 25) -> Tổng thặng dư = 40 sp.
        Đích: D1 (thiếu 20), D2 (thiếu 15) -> Tổng thiếu = 35 sp.
        """
        from data_mining.decision_support.transfer_recommendation import compute_transfer_pairs

        df_multi = pd.DataFrame([
            # 2 Kho nguồn (surplus > 0)
            {"ma_sp": "SP_MULTI", "ma_kho": "S1", "so_luong": 65, "target_stock": 50, "surplus": 15, "dos": 30.0},
            {"ma_sp": "SP_MULTI", "ma_kho": "S2", "so_luong": 75, "target_stock": 50, "surplus": 25, "dos": 35.0},
            # 2 Kho nhận (surplus < 0)
            {"ma_sp": "SP_MULTI", "ma_kho": "D1", "so_luong": 30, "target_stock": 50, "surplus": -20, "dos": 6.0},
            {"ma_sp": "SP_MULTI", "ma_kho": "D2", "so_luong": 35, "target_stock": 50, "surplus": -15, "dos": 7.0},
        ])

        recs = compute_transfer_pairs(df_multi)

        # Kiểm tra các bất biến hệ thống:
        total_from_s1 = sum(r["so_luong_de_xuat"] for r in recs if r["kho_nguon"] == "S1")
        total_from_s2 = sum(r["so_luong_de_xuat"] for r in recs if r["kho_nguon"] == "S2")

        # 1. Không nguồn nào bị rút vượt quá thặng dư ban đầu
        self.assertLessEqual(total_from_s1, 15, "Tổng rút từ S1 không được vượt quá thặng dư 15")
        self.assertLessEqual(total_from_s2, 25, "Tổng rút từ S2 không được vượt quá thặng dư 25")

        # 2. Toàn bộ các đề xuất phải có số lượng dương và là bội số của 5
        for r in recs:
            self.assertGreater(r["so_luong_de_xuat"], 0, "Số lượng đề xuất phải > 0")
            self.assertEqual(r["so_luong_de_xuat"] % 5, 0, "Số lượng đề xuất phải là bội số của 5")
            self.assertNotEqual(r["kho_nguon"], r["kho_dich"], "Kho nguồn và đích không được trùng nhau")

    def test_invariants_on_production_output_json(self):
        """
        [KIỂM THỬ BẤT BIẾN THỰC TẾ] Kiểm tra các bất biến trên file kết quả transfer_recommendations.json hiện tại.
        """
        with self.json_file.open("r", encoding="utf-8") as f:
            data = json.load(f)

        items = data.get("items", [])
        # Gom nhóm số lượng đề xuất theo (ma_sp, kho_nguon)
        allocated_by_src = {}
        for r in items:
            key = (r["ma_sp"], r["kho_nguon"])
            allocated_by_src[key] = allocated_by_src.get(key, 0) + r["so_luong_de_xuat"]
            # Kiểm tra lượng đề xuất không âm và >= 5
            self.assertGreaterEqual(r["so_luong_de_xuat"], 5, "Lượng đề xuất phải >= 5")
            self.assertEqual(r["so_luong_de_xuat"] % 5, 0, "Lượng đề xuất phải là bội số của 5")

        # Xác minh tổng lượng lấy từ mỗi kho nguồn không vượt quá tồn kho khả dụng hiện tại
        for r in items:
            key = (r["ma_sp"], r["kho_nguon"])
            total_allocated = allocated_by_src[key]
            self.assertLessEqual(
                total_allocated, r["ton_kho_nguon"],
                f"Tổng phân bổ ({total_allocated}) vượt quá tồn kho nguồn ({r['ton_kho_nguon']})"
            )


class TestModelRegistryTracker(unittest.TestCase):
    """
    Bộ kiểm thử cho Nền tảng MLOps: Quản lý phiên bản và phát hiện suy giảm chất lượng (Drift Proxy).
    """

    def setUp(self):
        self.metadata_file = MODEL_REGISTRY_DIR / "model_versions.json"

    def test_model_version_history_exists(self):
        """Kiểm tra file model_versions.json tồn tại và có phiên bản Active."""
        self.assertTrue(self.metadata_file.exists(), f"Thiếu file model_versions.json: {self.metadata_file}")
        with self.metadata_file.open("r", encoding="utf-8") as f:
            history = json.load(f)
        self.assertIsNotNone(history.get("active_version"), "Phải có phiên bản Active")
        self.assertGreater(history.get("total_versions", 0), 0)

    def test_drift_and_degradation_detection(self):
        """Kiểm tra thuật toán phát hiện suy giảm chất lượng mô hình (Model Drift/Degradation Proxy)."""
        from data_mining.models.model_registry.model_tracker import compare_with_active

        # Test case A: Mô hình ứng viên tốt hơn Active
        res_improved = compare_with_active({"mae": 13.80, "rmse": 16.80}, model_name="lightgbm")
        self.assertEqual(res_improved["status"], "IMPROVED")
        self.assertEqual(res_improved["recommendation"], "APPROVE_FOR_STAGING")

        # Test case B: Mô hình ứng viên suy giảm chất lượng (MAE tăng > 10%)
        res_degraded = compare_with_active({"mae": 16.50, "rmse": 20.00}, model_name="lightgbm")
        self.assertEqual(res_degraded["status"], "DEGRADATION_DETECTED")
        self.assertEqual(res_degraded["recommendation"], "REJECT_CANDIDATE")
        self.assertGreater(res_degraded["delta_mae_pct"], 10.0)


if __name__ == "__main__":
    unittest.main()
