# AQI forecast experiment results

Selected model: **Random Forest depth10 leaf5**, using **AQI plus pollutants**.

City: Delhi. Forecast: next calendar day. Eligible samples: 1993.

## Final held-out test results

| Predictor | MAE | RMSE | R² |
|---|---:|---:|---:|
| selected_model | 27.141 | 36.701 | 0.909 |
| persistence | 34.498 | 48.354 | 0.842 |
| development_mean | 114.236 | 131.169 | -0.165 |

MAE improvement over persistence: 21.33%.

## Interpretation

A negative improvement means the ML model performed worse than persistence. The model was selected with validation data only, then refitted on training plus validation; test scores did not drive selection.

The AQI-only versus AQI-plus-pollutants experiment is in validation_results.csv and validation_ablation.png. Importance is measured on validation before the final refit.

## Limits

Historical Delhi measurements do not establish present-day or other-city forecasting performance. Test days use the actual previous day's observations, as in a rolling daily forecast. Daily publication delays are not modeled. Severe episodes and missing readings limit reliability. The 2020 test period may reflect unusual conditions; no causal claim is made.

Pollutant units and dataset license still need source-metadata verification. Predictions are evaluated without clipping. Today's AQI must be available at forecast time.

## Artifacts

See data_audit.json, split_metadata.json, validation_results.csv, test_metrics.json, test_predictions.csv, test_errors_by_group.csv, and figures/. The saved pipeline passed prediction-equivalence checks after reloading.

Observed AQI above 500: 48 city records. These source labels were retained; verify their derivation before interpreting values against the 0-500 official display bands.
