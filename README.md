# Delhi AQI Forecast Lab

A next-calendar-day AQI forecasting experiment with an interactive Streamlit dashboard. It uses today's Delhi AQI and six pollutant observations to estimate tomorrow's AQI. The dashboard presents saved historical evidence, replays recorded forecasts, and runs new manual or CSV forecasts when the fitted pipeline is available.

## Dashboard

- **Overview:** full-test metrics, a date-filtered observed/predicted timeline, an error scatterplot, severity-group errors, and downloadable test predictions.
- **Forecast:** historical replay, validated manual observations, and CSV batch forecasts with downloadable results.
- **Model & evidence:** validation model comparisons, permutation feature importance, chronological splits, model provenance, and limitations.

The dashboard opens in **report-only mode** when `models/aqi_pipeline.joblib` is absent. Overview, historical replay, and model evidence still work. Historical replay displays saved test predictions; it does not generate new predictions or represent live monitoring.

## Quick start

Use Python 3.13 to match the original experiment. Run all commands from the repository root.

### macOS / Linux

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-dashboard.txt
.venv/bin/python -m streamlit run app.py
```

### Windows PowerShell

```powershell
py -3.13 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-dashboard.txt
./.venv/Scripts/python.exe -m streamlit run app.py
```

Open the local URL printed by Streamlit (normally `http://localhost:8501`). Stop with Ctrl+C. The dashboard resolves report/model paths relative to `app.py`.

`requirements-lock.txt` preserves the original training environment. `requirements-dashboard.txt` adds pinned direct dashboard dependencies. `requirements.txt` provides supported version ranges for a fresh compatible environment; it is not an exact experiment reproduction. No dataset download is needed to explore committed reports.

## Enable new forecasts

Download [Air Quality Data in India](https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india) and place `city_day.csv` in `data/raw/`. Verify dataset licence and source metadata before redistribution. Raw data, processed data, virtual environments and model binaries are intentionally excluded from Git.

```bash
.venv/bin/python -m src.train --data data/raw/city_day.csv --city Delhi
.venv/bin/python -m src.verify_model
```

On Windows, replace `.venv/bin/python` with `./.venv/Scripts/python.exe`. Training regenerates processed splits, reports, model metadata and `models/aqi_pipeline.joblib`. Refresh the dashboard after training. The fitted pipeline is cached between interactions and reloaded when the model file changes; the interface never retrains on a button click.

For manual forecasts, enter the observation date, today's AQI, and the model's named pollutants in the dataset's source units. Mark unavailable pollutants explicitly; the trained imputer handles their missing values. Today's AQI cannot be missing. The city is fixed to the model metadata (Delhi in the committed experiment).

For CSV uploads, provide `City`, `Date`, and all feature columns listed in `models/model_metadata.json`; use `example_input.csv` as a template. Empty pollutant cells are allowed. Incorrect cities, absent features, negative or infinite readings, invalid dates, and missing current AQI are rejected. Uploads are limited to 10,000 rows. Dates label the forecast for the following calendar day; they are not model features.

## Command-line prediction

```bash
.venv/bin/python -m src.predict --input example_input.csv
```

Outputs are saved to `reports/new_predictions.csv` by default. The CLI supports `--model`, `--metadata`, and `--output` overrides.

## Measured results

The selected model is Random Forest (200 trees, maximum depth 10, minimum leaf size 5), using AQI plus pollutants. There are 1,993 eligible Delhi samples: 1,395 training, 299 validation and 299 test samples. Final target dates span September 7, 2019–July 1, 2020.

- Test MAE: **27.141 AQI points**
- Test RMSE: **36.701 AQI points**
- Test R²: **0.909**
- MAE reduction over persistence (tomorrow equals today): **21.33%**

The experiment compares Linear Regression, Random Forest and Gradient Boosting across AQI-only and AQI-plus-pollutant inputs. Selection uses validation MAE, followed by a development-data refit and final held-out evaluation. Median imputation and missingness indicators are fitted within pipelines; linear models also scale inputs. Targets match the exact next calendar day rather than the next available row.

Read [reports/RESULTS.md](reports/RESULTS.md) for measured results and limitations, and [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the original assignment plan.

## Categories and interpretation

The interface uses [Indian CPCB AQI categories](https://www.airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf): Good (0–50), Satisfactory (51–100), Moderate (101–200), Poor (201–300), Very Poor (301–400), and Severe (401–500). Category assignment rounds valid raw predictions to the nearest integer, with exact halves rounded upward. Numeric forecasts and exported values retain their original precision. The compact forecast metric displays one decimal.

Raw predictions outside 0–500 are flagged and receive no standard category; they are never clipped. This also applies to historical replay. Categories describe a forecast, not an official observed AQI reading or a medical recommendation.

This is an offline historical Delhi experiment. It does not establish present-day or other-city accuracy, model publication delays, or connect a real-time data feed. Today's AQI must be known at prediction time. Extreme episodes have larger errors. Pollutant units and dataset licence remain unverified; 48 source AQI records above 500 require provenance checks. Validation feature importance is predictive rather than causal.

## Project layout

```text
app.py                       Streamlit dashboard
.streamlit/config.toml       Dashboard theme
src/prepare_data.py          Cleaning and calendar-aligned targets
src/train.py                 Model search, training and report generation
src/predict.py               Shared validation and inference / CLI
src/dashboard.py             Category and forecast export formatting
src/evaluate.py              Metrics and figures
src/verify_model.py          Saved-model equivalence checks
models/model_metadata.json   Model schema, parameters and provenance
reports/                     Saved evidence, predictions and figures
tests/                       Forecasting and dashboard checks
```

## Development checks

```bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app.py src tests
git diff --check
```

GitHub Actions runs tests and Python syntax checks without the raw dataset. Dashboard tests exercise report-only navigation, category boundaries, forecast exports, and new-forecast input validation with a temporary fitted fixture. That fixture does not verify the original model's measured accuracy. Verify real-model inference separately with `src.verify_model` after training.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and review workflow. Keep datasets, fitted binaries, credentials and local machine paths out of commits.
