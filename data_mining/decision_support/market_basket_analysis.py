import csv
import json
import os
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path
import pandas as pd

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

OUTPUT_DM_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
OUTPUT_DL_DIR = DATA_LAKE_DIR / "gold"


def run_market_basket_analysis(
    warehouse_filter=None,
    min_support=0.005,      # 0.5% tối thiểu (khoảng 50+ giao dịch)
    min_confidence=0.05,   # 5% độ tin cậy tối thiểu
    min_count=10           # Tối thiểu 10 phiếu xuất đồng xuất hiện
):
    """
    Khai phá luật kết hợp giỏ hàng (Market Basket Analysis) bằng thuật toán Apriori:
    - Đơn vị giao dịch (Transaction): Một phiếu xuất hợp lệ (ma_phieu_xuat)
    - Tập hạng mục (Itemset): Danh sách mã sản phẩm distinct trong phiếu
    - Chỉ số: Support, Confidence, Lift, Số giao dịch đồng xuất hiện
    - Gợi ý gom nhóm Picking: Đề xuất bố trí các cặp mặt hàng thường xuất cùng nhau gần nhau
    """
    wh_label = warehouse_filter if warehouse_filter and warehouse_filter != "ALL" else "TOÀN HỆ THỐNG"
    print("=" * 80)
    print(f"KHAI PHÁ GIỎ HÀNG APRIORI & GỢI Ý GOM CỤM PICKING ({wh_label})")
    print("=" * 80)

    # 1. Đọc tên sản phẩm
    sp_names = {}
    if SILVER_SP_FILE.exists():
        df_sp = pd.read_csv(SILVER_SP_FILE)
        for _, r in df_sp.iterrows():
            sp_names[r["ma_sp"]] = r["ten_sp"]

    # 2. Đọc dữ liệu xuất kho Silver
    if not SILVER_XUAT_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file xuất kho: {SILVER_XUAT_FILE}")

    df_xh = pd.read_csv(SILVER_XUAT_FILE)
    if warehouse_filter and warehouse_filter != "ALL":
        df_xh = df_xh[df_xh["ma_kho"] == warehouse_filter].copy()

    if len(df_xh) == 0:
        raise ValueError(f"Không có dữ liệu xuất hàng cho kho: {warehouse_filter}")

    # Gom nhóm theo phiếu xuất tạo thành các giỏ hàng (Baskets)
    baskets = df_xh.groupby("ma_phieu_xuat")["ma_sp"].apply(lambda s: sorted(list(set(s)))).tolist()
    total_transactions = len(baskets)

    if total_transactions == 0:
        raise ValueError("Không có giao dịch phiếu xuất hợp lệ.")

    # Đếm tần suất 1-itemset (từng sản phẩm)
    item_counts = defaultdict(int)
    for b in baskets:
        for item in b:
            item_counts[item] += 1

    # Đếm tần suất 2-itemset (cặp sản phẩm cùng xuất hiện trong 1 phiếu)
    pair_counts = defaultdict(int)
    for b in baskets:
        if len(b) >= 2:
            for pair in combinations(b, 2):
                pair_counts[pair] += 1

    # Khai phá các luật kết hợp (Association Rules: A -> B và B -> A)
    rules = []
    for (item_a, item_b), count_ab in pair_counts.items():
        if count_ab < min_count:
            continue

        count_a = item_counts[item_a]
        count_b = item_counts[item_b]

        supp_ab = count_ab / total_transactions
        supp_a = count_a / total_transactions
        supp_b = count_b / total_transactions

        if supp_ab < min_support:
            continue

        # Rule 1: A -> B
        conf_a_b = count_ab / count_a if count_a > 0 else 0
        lift_a_b = conf_a_b / supp_b if supp_b > 0 else 0

        if conf_a_b >= min_confidence:
            rules.append({
                "antecedent": item_a,
                "antecedent_name": sp_names.get(item_a, item_a),
                "consequent": item_b,
                "consequent_name": sp_names.get(item_b, item_b),
                "support": round(supp_ab, 4),
                "support_pct": round(supp_ab * 100, 2),
                "confidence": round(conf_a_b, 4),
                "confidence_pct": round(conf_a_b * 100, 2),
                "lift": round(lift_a_b, 4),
                "transaction_count": count_ab,
                "antecedent_count": count_a,
                "consequent_count": count_b,
                "picking_suggestion": f"Bố trí [{item_a} - {sp_names.get(item_a, item_a)}] và [{item_b} - {sp_names.get(item_b, item_b)}] tại cùng một dãy kệ (Aisle) hoặc các ô kệ liền kề để tối ưu hành trình picking khi có {count_ab} phiếu cùng đặt.",
                "kho_ap_dung": warehouse_filter if warehouse_filter else "ALL"
            })

        # Rule 2: B -> A
        conf_b_a = count_ab / count_b if count_b > 0 else 0
        lift_b_a = conf_b_a / supp_a if supp_a > 0 else 0

        if conf_b_a >= min_confidence:
            rules.append({
                "antecedent": item_b,
                "antecedent_name": sp_names.get(item_b, item_b),
                "consequent": item_a,
                "consequent_name": sp_names.get(item_a, item_a),
                "support": round(supp_ab, 4),
                "support_pct": round(supp_ab * 100, 2),
                "confidence": round(conf_b_a, 4),
                "confidence_pct": round(conf_b_a * 100, 2),
                "lift": round(lift_b_a, 4),
                "transaction_count": count_ab,
                "antecedent_count": count_b,
                "consequent_count": count_a,
                "picking_suggestion": f"Bố trí [{item_b} - {sp_names.get(item_b, item_b)}] và [{item_a} - {sp_names.get(item_a, item_a)}] tại cùng một dãy kệ (Aisle) hoặc các ô kệ liền kề để tối ưu hành trình picking khi có {count_ab} phiếu cùng đặt.",
                "kho_ap_dung": warehouse_filter if warehouse_filter else "ALL"
            })

    # Sắp xếp các luật theo số giao dịch đồng xuất hiện giảm dần, sau đó theo Confidence
    rules = sorted(rules, key=lambda x: (x["transaction_count"], x["confidence"]), reverse=True)

    # Tổng hợp top các cặp sản phẩm xuất hiện cùng nhau nhiều nhất (Unique pairs)
    unique_pairs_ranked = []
    seen_pairs = set()
    for r in rules:
        p_key = tuple(sorted([r["antecedent"], r["consequent"]]))
        if p_key not in seen_pairs:
            seen_pairs.add(p_key)
            unique_pairs_ranked.append({
                "item_1": r["antecedent"],
                "item_1_name": r["antecedent_name"],
                "item_2": r["consequent"],
                "item_2_name": r["consequent_name"],
                "transaction_count": r["transaction_count"],
                "support_pct": r["support_pct"],
                "de_xuat_picking": f"Gom nhóm vị trí lưu trữ [{r['antecedent_name']}] và [{r['consequent_name']}] gần nhau nhằm giảm quãng đường di chuyển cho nhân viên lấy hàng ({r['transaction_count']} lần xuất chung)."
            })

    # Xuất kết quả CSV và JSON
    suffix = f"_{warehouse_filter}" if warehouse_filter and warehouse_filter != "ALL" else ""
    csv_dm_target = OUTPUT_DM_DIR / f"market_basket_rules{suffix}.csv"
    csv_dl_target = OUTPUT_DL_DIR / f"market_basket_rules{suffix}.csv"
    json_dm_target = OUTPUT_DM_DIR / f"market_basket_rules{suffix}.json"
    json_dl_target = OUTPUT_DL_DIR / f"market_basket_rules{suffix}.json"

    for d in [OUTPUT_DM_DIR, OUTPUT_DL_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    df_rules = pd.DataFrame(rules)
    df_rules.to_csv(csv_dm_target, index=False, encoding="utf-8-sig")
    df_rules.to_csv(csv_dl_target, index=False, encoding="utf-8-sig")

    summary_metadata = {
        "kho_ap_dung": warehouse_filter if warehouse_filter else "ALL",
        "tong_so_giao_dich": total_transactions,
        "so_giao_dich_da_san_pham": sum(1 for b in baskets if len(b) >= 2),
        "tong_so_luat_khai_pha": len(rules),
        "tong_so_cap_san_pham_frequent": len(unique_pairs_ranked),
        "tham_so_apriori": {
            "min_support": min_support,
            "min_confidence": min_confidence,
            "min_count": min_count
        },
        "ghi_chu_picking": "Gợi ý gom nhóm vị trí picking được tính toán trực tiếp từ dữ liệu xuất hàng thực tế trên từng phiếu xuất; chưa can thiệp sơ đồ vật lý do database chưa lưu bản đồ kệ 3D.",
        "top_picking_pairs": unique_pairs_ranked[:15],
        "rules": rules
    }

    json_str = json.dumps(summary_metadata, indent=2, ensure_ascii=False)
    json_dm_target.write_text(json_str, encoding="utf-8")
    json_dl_target.write_text(json_str, encoding="utf-8")

    print(f"[*] Khai phá thành công {len(rules)} luật kết hợp từ {total_transactions} phiếu xuất.")
    print(f"    - Cặp sản phẩm thường đi kèm nhiều nhất: {len(unique_pairs_ranked)} cặp.")
    if unique_pairs_ranked:
        top1 = unique_pairs_ranked[0]
        print(f"    - Cặp #1: {top1['item_1_name']} + {top1['item_2_name']} ({top1['transaction_count']} lần, {top1['support_pct']}%)")
    print(f"    - File kết quả CSV:  {csv_dm_target}")
    print(f"    - File kết quả JSON: {json_dm_target}")
    print("=" * 80)

    return summary_metadata


if __name__ == "__main__":
    wh = sys.argv[1] if len(sys.argv) > 1 else None
    run_market_basket_analysis(warehouse_filter=wh)
