# Weekly demand forecast evaluation

- Source analytical data: 2025-10-28 to 2026-10-27.
- Complete Monday-Sunday weeks after warm-up: 43.
- Holdout: 2026-08-24 to 2026-10-25 (9 weekly origins, 540 warehouse-product-week rows).
- Forecast target: the total observed quantity per product and warehouse for the next complete week.
- Model and calibration are selected only on chronological walk-forward validation; holdout is not used for selection.

## Walk-forward validation

| Model | Calibrated WAPE | MAE | Scale |
|---|---:|---:|---:|
| Extra Trees Regressor (weekly) | 23.31% | 34.42 | 1.00 |
| Random Forest Regressor (weekly) | 24.46% | 36.12 | 1.00 |
| Gradient Boosting (weekly) | 24.46% | 36.12 | 1.05 |
| Ridge Regression (weekly) | 25.14% | 37.13 | 0.97 |

## Untouched weekly holdout

| Model | WAPE | `100 - WAPE` | MAE |
|---|---:|---:|---:|
| Random Forest Regressor (weekly) | 23.52% | 76.48% | 33.48 |
| Extra Trees Regressor (weekly) | 23.53% | 76.47% | 33.48 |
| Gradient Boosting (weekly) | 23.84% | 76.16% | 33.93 |
| Ridge Regression (weekly) | 23.97% | 76.03% | 34.11 |
| Rolling 8-week mean (baseline) | 24.38% | 75.62% | 34.69 |

Selected production model: **Extra Trees Regressor (weekly)**; calibration scale `1.00`. The model was refit on all 2,580 complete warehouse-product-week observations through 2026-10-19 after holdout evaluation.

> `100 - WAPE` is a relative aggregate-error score, not a classification accuracy. Weekly results are a different forecast horizon from the daily one-step results and must not be compared as if they were the same task.

## Data readiness for live use

The latest observed daily row is **2026-10-27**, 0 days before this run. The source is recent enough for a current weekly forecast. Seed transactions dated after the source observation window are not treated as actual demand.

When using the model, aggregate and refresh actual demand weekly, then predict the following complete week. This is a one-week rolling forecast, not a multi-week forecast made in advance.

Live forecast generation status: **BLOCKED_SOURCE_NOT_READY**. A next-week forecast requires data through a complete Sunday. The forecast output is `data_mining/datasets/gold/weekly_next_forecast.csv`; the status is also written to `data_mining/datasets/gold/weekly_live_forecast_status.json`.

Re-run using `py data_mining/models/train_weekly_forecast.py` or `py data_mining/run_pipeline.py` after refreshing the analytical dataset.
