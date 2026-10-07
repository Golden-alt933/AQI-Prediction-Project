# AQI Prediction Project

AI for Engineers model project. Uses today's Delhi pollutant readings and observed AQI to forecast the **next calendar day's AQI**. The detailed assignment plan is in [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## Run on Windows PowerShell

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-lock.txt
./.venv/Scripts/python.exe -m unittest discover -s tests -v
./.venv/Scripts/python.exe -m src.train --data data/raw/city_day.csv --city Delhi
./.venv/Scripts/python.exe -m src.predict --input example_input.csv
./.venv/Scripts/python.exe -m src.verify_model
```

Before training, download [Air Quality Data in India](https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india) and place `city_day.csv` in `data/raw/`. The author's local copy is already present; the GitHub repository excludes raw data, fitted model binaries, virtual environments and package caches. The training command recreates the saved model and processed data.

An exact environment snapshot is saved as `requirements-lock.txt` after the verified run. A new machine can install the locked versions into a standard virtual environment using the commands above. Linux/macOS users can replace `./.venv/Scripts/python.exe` with `./.venv/bin/python`.

## Experiment

- Audits the actual CSV, rejects conflicting city/date records, handles invalid readings, and joins exact next-day targets.
- Splits approximately 70/15/15 by target date, verifies label availability, and fits imputation/scaling inside training pipelines.
- Compares training-mean and persistence baselines with Linear Regression, Random Forest, and Gradient Boosting.
- Runs a small predetermined validation search and an AQI-only versus AQI-plus-pollutants feature study.
- Selects the ML candidate by validation MAE, refits on training plus validation, and evaluates once on the final test period.
- Saves EDA, feature importance, errors, predictions, model metadata and the full fitted pipeline.

Read [reports/RESULTS.md](reports/RESULTS.md) for actual scores, interpretation, and limits after training. Score values are measured, not promised. The latest test period is historical; this is an offline forecasting experiment. Data license and pollutant units still require verification from source metadata before redistribution or unit-labelled integration.

The prediction command takes CSV inputs with the exact feature names in `models/model_metadata.json`. Include `aqi_today`; missing pollutant cells are imputed by the saved pipeline. The model is scoped to the city in its metadata. Predictions are not clipped, and values outside 0–500 are flagged.

The Streamlit interface is the guide's later phase. This deliverable completes the model and command-line prediction path first.

## Team development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, review and validation workflow. GitHub Actions checks the forecasting contract and Python syntax on pushes and pull requests. The workflow needs no dataset; actual training and inference verification are separate local checks.
