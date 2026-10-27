# 15-day and 30-day cumulative demand forecast evaluation

- Latest source date: 2026-10-27.
- Live status: READY.
- Live status reason: Forecasts available.

| Horizon | Selected model | MAE | RMSE | MAPE* | MAPE n | WAPE | 100 - WAPE | Origins | Rows |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 days | Ridge Regression | 51.66 | 88.53 | 58.41% | 297/3 excluded | 16.68% | 83.32% | 5 | 300 |
| 30 days | Ridge Regression | 75.63 | 121.08 | 40.49% | 180/0 excluded | 12.18% | 87.82% | 3 | 180 |

*MAPE is calculated only on rows where actual cumulative demand is greater than zero; zero-actual rows are excluded because percentage error is undefined.

## Metrics by model and horizon

| Horizon | Model | MAE | RMSE | MAPE* | MAPE n | WAPE | Validation WAPE |
|---:|---|---:|---:|---:|---:|---:|---:|
| 15 days | Ridge Regression | 51.66 | 88.53 | 58.41% | 297/3 excluded | 16.68% | 18.38% |
| 15 days | 30-day rolling mean baseline | 59.53 | 106.77 | 41.73% | 297/3 excluded | 19.22% | 21.57% |
| 30 days | Ridge Regression | 75.63 | 121.08 | 40.49% | 180/0 excluded | 12.18% | 12.54% |
| 30 days | 30-day rolling mean baseline | 97.84 | 163.67 | 32.47% | 180/0 excluded | 15.76% | 13.93% |

`100 - WAPE` is an aggregate relative-error score, not classification accuracy.
MAE and RMSE are measured in units per warehouse-product pair over the full horizon; they are not daily averages.
Holdout windows are non-overlapping; the 30-day metric is based on a small number of independent time origins and is not yet a strong reliability claim.
Live forecasts are blocked when source data is more than seven days old.

Artifacts: `datasets/gold/horizon_forecast_results.csv` (holdout), `datasets/gold/horizon_next_forecast.csv` (live forecast), and `datasets/gold/horizon_live_forecast_status.json` (freshness status).
