# -*- coding: utf-8 -*-
"""
Module: model_tracker.py
Mục đích: Nền tảng MLOps nhẹ phục vụ quản lý phiên bản mô hình, theo dõi chỉ số đánh giá
và phát hiện sớm dấu hiệu suy giảm chất lượng dự báo (Performance Degradation / Drift Proxy).
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List

REGISTRY_DIR = Path(__file__).resolve().parent
METADATA_FILE = REGISTRY_DIR / "model_versions.json"


def load_version_history() -> Dict[str, Any]:
    """Tải lịch sử phiên bản từ model_versions.json"""
    if not METADATA_FILE.exists():
        return {
            "active_version": None,
            "total_versions": 0,
            "versions": []
        }
    try:
        with METADATA_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {
            "active_version": None,
            "total_versions": 0,
            "versions": []
        }


def save_version_history(history: Dict[str, Any]) -> None:
    """Lưu lịch sử phiên bản ra file model_versions.json"""
    with METADATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def record_model_version(
    version_id: str,
    metrics: Dict[str, Dict[str, float]],
    dataset_info: Dict[str, Any],
    features: List[str],
    description: str = "",
    set_as_active: bool = False
) -> Dict[str, Any]:
    """
    Ghi nhận một phiên bản mô hình mới vào registry.
    """
    history = load_version_history()
    
    version_record = {
        "version_id": version_id,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "description": description,
        "dataset_info": dataset_info,
        "features": features,
        "metrics": metrics,
        "is_active": set_as_active
    }
    
    if set_as_active:
        for v in history["versions"]:
            v["is_active"] = False
        history["active_version"] = version_id

    existing_idx = next((i for i, v in enumerate(history["versions"]) if v["version_id"] == version_id), None)
    if existing_idx is not None:
        history["versions"][existing_idx] = version_record
    else:
        history["versions"].append(version_record)
        history["total_versions"] = len(history["versions"])

    if history["active_version"] is None:
        history["active_version"] = version_id
        version_record["is_active"] = True

    save_version_history(history)
    return version_record


def compare_with_active(candidate_metrics: Dict[str, float], model_name: str = "lightgbm", threshold_pct: float = 10.0) -> Dict[str, Any]:
    """
    So sánh chỉ số của mô hình ứng viên với phiên bản đang Active trong Production.
    
    Tham số:
    - candidate_metrics: dict chứa ít nhất 'mae' và 'rmse' của mô hình ứng viên.
    - model_name: tên thuật toán so sánh ('ridge', 'lightgbm', 'random_forest').
    - threshold_pct: ngưỡng phần trăm tăng MAE cảnh báo suy giảm chất lượng (mặc định 10.0%).
    """
    history = load_version_history()
    active_version_id = history.get("active_version")
    if not active_version_id:
        return {
            "status": "NO_ACTIVE_VERSION",
            "message": "Chua co phien ban Active nao trong registry de so sanh.",
            "recommendation": "APPROVE_FIRST_VERSION"
        }

    active_rec = next((v for v in history["versions"] if v["version_id"] == active_version_id), None)
    if not active_rec or model_name not in active_rec.get("metrics", {}):
        return {
            "status": "ACTIVE_METRICS_MISSING",
            "message": f"Phiên ban active '{active_version_id}' khong co metrics cho model '{model_name}'.",
            "recommendation": "REVIEW_MANUALLY"
        }

    active_model_metrics = active_rec["metrics"][model_name]
    active_mae = active_model_metrics.get("mae", 0.0)
    candidate_mae = candidate_metrics.get("mae", 0.0)

    if active_mae <= 0:
        delta_pct = 0.0
    else:
        delta_pct = ((candidate_mae - active_mae) / active_mae) * 100.0

    if delta_pct > threshold_pct:
        status = "DEGRADATION_DETECTED"
        recommendation = "REJECT_CANDIDATE"
        alert_msg = f"CANH BAO: MAE ung vien ({candidate_mae:.4f}) tang +{delta_pct:.2f}% so voi Active ({active_mae:.4f}), vuot nguong an toan {threshold_pct}%."
    elif delta_pct <= 0:
        status = "IMPROVED"
        recommendation = "APPROVE_FOR_STAGING"
        alert_msg = f"TOT: MAE ung vien ({candidate_mae:.4f}) giam {abs(delta_pct):.2f}% so voi Active ({active_mae:.4f})."
    else:
        status = "ACCEPTABLE"
        recommendation = "APPROVE_FOR_STAGING"
        alert_msg = f"CHAP NHAN: MAE ung vien tang nhe +{delta_pct:.2f}%, nam trong bien do cho phep ({threshold_pct}%)."

    return {
        "status": status,
        "active_version": active_version_id,
        "model_name": model_name,
        "active_mae": active_mae,
        "candidate_mae": candidate_mae,
        "delta_mae_pct": round(delta_pct, 2),
        "threshold_pct": threshold_pct,
        "recommendation": recommendation,
        "message": alert_msg
    }
