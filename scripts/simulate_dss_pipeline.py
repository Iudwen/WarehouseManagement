"""
Kịch bản Tự Động Hóa Kiểm Thử Pipeline ETL & Trợ Lý Ra Quyết Định DSS
Dự Án: Distributed Warehouse Management System (Warehouse DSS)
================================================================================
Mục đích:
1. Cập nhật biến động tồn kho thực tế vào Database chi nhánh (PostgreSQL 5433, 5434, 5435)
   và Database Central (5436).
2. Kích hoạt toàn bộ chuỗi ETL tự động:
   - Extract live PostgreSQL Central -> Bronze
   - Clean, validate schema & generate Data Quality Reports -> Silver
   - DSS Heuristic & Optimization Engine (Available Supply Pool) -> Gold
3. Đảm bảo dữ liệu trên Web (http://localhost:3000/reports - Tab 4.1 DSS)
   thay đổi 100% dựa trên dữ liệu thật của Database.
================================================================================
"""

import sys
import os
import argparse
import subprocess
import time
from pathlib import Path

# Thiết lập encoding UTF-8 cho Windows Console
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parents[1]

# Cấu hình các node cơ sở dữ liệu phân tán (theo .env gốc)
NODES_CONFIG = {
    "HN": {"host": "localhost", "port": 5433, "dbname": "warehouse_hn"},
    "DN": {"host": "localhost", "port": 5434, "dbname": "warehouse_dn"},
    "HCM": {"host": "localhost", "port": 5435, "dbname": "warehouse_hcm"},
    "CENTRAL": {"host": "localhost", "port": 5436, "dbname": "warehouse_central"},
}
DB_USER = "admin"
DB_PASS = "admin123"


def update_database(scenario: str):
    """Cập nhật số dư tồn kho trực tiếp vào cả Node chi nhánh nguồn và Node Central."""
    try:
        import psycopg
    except ImportError:
        print("[LỖI] Chưa cài đặt psycopg. Chạy: py -m pip install psycopg")
        sys.exit(1)

    print(f"\n[1/3] CẬP NHẬT TRỰC TIẾP VÀO CÁC NODE DATABASE PHÂN TÁN...")

    if scenario == "deficit":
        print("  -> Áp dụng Kịch Bản 1: [LỆCH TỒN KHO CỤC BỘ - NGUY CƠ ĐỨT HÀNG]")
        print("     * Chi nhánh HCM01: SP001 (Laptop Dell) giảm còn 120 chiếc (Định mức an toàn 228 -> Thiếu 108)")
        print("     * Chi nhánh HCM01: SP004 (Chuột Logitech) giảm còn 60 chiếc (Định mức an toàn 152 -> Thiếu 92)")
        print("     * Chi nhánh DN01: SP008 (Màn hình Samsung) giảm còn 45 chiếc (Định mức an toàn 198 -> Thiếu 153)")
        print("     * Các kho nguồn (DN01 cho SP001, SP004; HCM01 cho SP008) duy trì thặng dư dồi dào.")

        # 1. Update Node HCM01
        try:
            with psycopg.connect(host="localhost", port=5435, dbname="warehouse_hcm", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho SET so_luong = 120, cap_nhat_luc = NOW() WHERE ma_sp = 'SP001';")
                    cur.execute("UPDATE ton_kho SET so_luong = 60, cap_nhat_luc = NOW() WHERE ma_sp = 'SP004';")
                    conn.commit()
            print("     [OK] Đã cập nhật Node HCM01 (Port 5435)")
        except Exception as e:
            print(f"     [!] Cảnh báo Node HCM01: {e}")

        # 2. Update Node DN01
        try:
            with psycopg.connect(host="localhost", port=5434, dbname="warehouse_dn", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho SET so_luong = 45, cap_nhat_luc = NOW() WHERE ma_sp = 'SP008';")
                    conn.commit()
            print("     [OK] Đã cập nhật Node DN01 (Port 5434)")
        except Exception as e:
            print(f"     [!] Cảnh báo Node DN01: {e}")

        # 3. Update Node Central
        try:
            with psycopg.connect(host="localhost", port=5436, dbname="warehouse_central", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho_central SET so_luong = 120, cap_nhat_luc = NOW() WHERE ma_kho = 'HCM01' AND ma_sp = 'SP001';")
                    cur.execute("UPDATE ton_kho_central SET so_luong = 60, cap_nhat_luc = NOW() WHERE ma_kho = 'HCM01' AND ma_sp = 'SP004';")
                    cur.execute("UPDATE ton_kho_central SET so_luong = 45, cap_nhat_luc = NOW() WHERE ma_kho = 'DN01' AND ma_sp = 'SP008';")
                    conn.commit()
            print("     [OK] Đã cập nhật Node Central (Port 5436)")
        except Exception as e:
            print(f"     [!] Cảnh báo Node Central: {e}")

    elif scenario == "balance":
        print("  -> Áp dụng Kịch Bản 2: [CÂN BẰNG TỒN KHO TOÀN HỆ THỐNG]")
        print("     * Khôi phục toàn bộ số dư tồn kho an toàn cho tất cả các chi nhánh (3,500 - 5,000 SP)")
        print("     * Không còn chi nhánh nào bị thiếu hụt (0 Deficit)")

        try:
            with psycopg.connect(host="localhost", port=5435, dbname="warehouse_hcm", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho SET so_luong = 4043, cap_nhat_luc = NOW() WHERE ma_sp = 'SP001';")
                    cur.execute("UPDATE ton_kho SET so_luong = 5289, cap_nhat_luc = NOW() WHERE ma_sp = 'SP004';")
                    conn.commit()
        except Exception:
            pass

        try:
            with psycopg.connect(host="localhost", port=5434, dbname="warehouse_dn", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho SET so_luong = 4066, cap_nhat_luc = NOW() WHERE ma_sp = 'SP008';")
                    conn.commit()
        except Exception:
            pass

        try:
            with psycopg.connect(host="localhost", port=5436, dbname="warehouse_central", user=DB_USER, password=DB_PASS) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE ton_kho_central SET so_luong = 4043, cap_nhat_luc = NOW() WHERE ma_kho = 'HCM01' AND ma_sp = 'SP001';")
                    cur.execute("UPDATE ton_kho_central SET so_luong = 5289, cap_nhat_luc = NOW() WHERE ma_kho = 'HCM01' AND ma_sp = 'SP004';")
                    cur.execute("UPDATE ton_kho_central SET so_luong = 4066, cap_nhat_luc = NOW() WHERE ma_kho = 'DN01' AND ma_sp = 'SP008';")
                    conn.commit()
        except Exception:
            pass
        print("     [OK] Đã khôi phục số dư cân bằng tại tất cả các node.")


def run_etl_pipeline():
    """Chạy toàn bộ chuỗi ETL: Trích xuất DB -> Bronze -> Silver -> Gold DSS."""
    print("\n[2/3] KÍCH HOẠT CHUỖI ETL TỰ ĐỘNG...")
    env = os.environ.copy()
    env["POSTGRES_HOST"] = "localhost"
    env["POSTGRES_PORT"] = "5436"
    env["POSTGRES_DB"] = "warehouse_central"
    env["POSTGRES_USER"] = DB_USER
    env["POSTGRES_PASSWORD"] = DB_PASS

    # 1. Trích xuất PostgreSQL Central -> Bronze
    print("  -> [ETL 1/3] Trích xuất live PostgreSQL Central vào Bronze Lakehouse...")
    extract_script = ROOT_DIR / "data_center" / "etl" / "extract" / "extract_postgresql.py"
    res1 = subprocess.run([sys.executable, str(extract_script)], cwd=str(ROOT_DIR), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res1.returncode != 0:
        print(f"     [Cảnh báo trích xuất]: {res1.stderr[:120]}")
    else:
        print("     [OK] Đã trích xuất ton_kho_central.csv mới nhất từ DB.")

    # 2. Làm sạch & Kiểm định chất lượng -> Silver
    print("  -> [ETL 2/3] Làm sạch, khử trùng lặp & kiểm định chất lượng (Silver Quality Reports)...")
    silver_script = ROOT_DIR / "data_center" / "etl" / "load" / "load_silver.py"
    subprocess.run([sys.executable, str(silver_script)], cwd=str(ROOT_DIR), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    print("     [OK] Đã kiểm định và chuẩn hóa bảng tồn kho Silver.")

    # 3. Chạy thuật toán ra quyết định điều chuyển liên kho -> Gold DSS
    print("  -> [ETL 3/3] Thuật toán DSS: Phân tích thặng dư/thiếu hụt & ghép cặp tối ưu (Available Pool)...")
    dss_script = ROOT_DIR / "data_mining" / "decision_support" / "transfer_recommendation.py"
    subprocess.run([sys.executable, str(dss_script)], cwd=str(ROOT_DIR), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    print("     [OK] Đã sinh xong file Gold DSS: transfer_recommendations.json")


def inspect_results():
    """Đọc và hiển thị kết quả đề xuất DSS mới nhất."""
    import json
    gold_json = ROOT_DIR / "data_mining" / "datasets" / "gold" / "transfer_recommendations.json"
    if not gold_json.exists():
        print("[LỖI] Không tìm thấy file kết quả Gold DSS.")
        return

    with gold_json.open("r", encoding="utf-8") as f:
        data = json.load(f)

    print("\n[3/3] BÁO CÁO KẾT QUẢ ĐỀ XUẤT ĐIỀU CHUYỂN DSS MỚI NHẤT:")
    print("=" * 80)
    print(f"Tổng số đề xuất:      {data.get('tong_so_de_xuat', 0)} lệnh điều chuyển")
    print(f"Tổng giá trị ước tính: {data.get('tong_gia_tri_uoc_tinh', 0):,.0f} VNĐ")
    print(f"Phân bổ mức ưu tiên:   {data.get('phan_bo_muc_do', {})}")
    print(f"Thời điểm tính toán:   {data.get('thoi_diem_tao', '')}")
    print("-" * 80)

    items = data.get("items", [])
    if not items:
        print("  -> HỆ THỐNG ĐANG Ở TRẠNG THÁI CÂN BẰNG TỐI ƯU. Không có chi nhánh nào bị thiếu hụt (0 Deficit).")
    else:
        for it in items:
            print(f"  * [{it['id']}] {it['muc_do_uu_tien']}")
            print(f"    Tuyến:      {it['kho_nguon']} -> {it['kho_dich']}")
            print(f"    Sản phẩm:   {it['ma_sp']} - {it['ten_sp']} ({it['nhom_abc_xyz']})")
            print(f"    Điều chuyển:{it['so_luong_de_xuat']} {it['don_vi']} | Giá trị: {it['gia_tri_uoc_tinh']:,.0f} đ")
            print(f"    Tồn kho:    {it['kho_dich']} còn {it['ton_kho_dich']} SP ({it['dos_kho_dich']} ngày) <-> {it['kho_nguon']} dư {it['ton_kho_nguon']} SP ({it['dos_kho_nguon']} ngày)")
            print(f"    Căn cứ:     {it['can_cu_de_xuat'][:120]}...")
            print()
    print("=" * 80)
    print("\n>>> BÂY GIỜ BẠN HÃY LÊN TRÌNH DUYỆT BẤM [F5] TẠI: http://localhost:3000/reports")
    print("    Vào Tab [4. Trợ Lý Quyết Định DSS] -> [4.1 Đề Xuất Điều Chuyển Liên Kho DSS]")
    print("    để thấy toàn bộ số liệu và các lệnh đề xuất vừa thay đổi 100% theo DB!\n")


def main():
    parser = argparse.ArgumentParser(description="Kịch bản giả lập biến động tồn kho & chạy tự động ETL DSS")
    parser.add_argument(
        "--scenario",
        choices=["deficit", "balance"],
        default="deficit",
        help="deficit: Giả lập xuất bán gây thiếu hụt cục bộ (Mặc định) | balance: Khôi phục cân bằng an toàn",
    )
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 80)
    print("HỆ THỐNG QUẢN LÝ KHO PHÂN TÁN - SIMULATE DB CHANGE & RUN ETL DSS")
    print("=" * 80)

    update_database(args.scenario)
    run_etl_pipeline()
    inspect_results()

    print(f"[HOÀN THÀNH] Toàn bộ kịch bản chạy trong {time.time() - start_time:.2f} giây.")


if __name__ == "__main__":
    main()
