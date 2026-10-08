# Dashboard guide

This guide describes how to run and demonstrate the Vayu India Air Quality Atlas. The dashboard uses static, browser-side data and local fonts. The current demonstration runs on the student's computer; it needs no server, database, remote font, paid API key, or external runtime service.

## What the dashboard shows

The historical explorer covers 26 Indian cities and 29,531 source rows from the supplied Air Quality Data in India dataset, from 2015 through 2020 (the observed dates differ by city). Choose a city and a year or exact date to inspect recorded AQI and pollutant measurements. The history view describes observations in the dataset; it is not a live monitor. Null measurements stay unavailable and are never filled with a made-up value.

The trained forecasting model has a narrower scope: it predicts one calendar day ahead for Delhi, using today's AQI and six pollutant fields (PM2.5, PM10, NO2, SO2, CO, and O3). It was trained on eligible Delhi observations from 2015–2020. It does not forecast other cities, arbitrary future years, multiple future days, or current conditions. In the scenario form, the date labels the input day and following-day target; date itself is not a model feature. Typed inputs are a scenario, not an observed value.

The training experiment compared Linear Regression, Random Forest, and Gradient Boosting variants, plus training-mean and persistence baselines. It used validation MAE to select between AQI-only and AQI-plus-pollutant inputs, and selected the depth-10 Random Forest with five rows per leaf. The report presents a chronological held-out test comparison against persistence (tomorrow equals today's AQI) and a training-plus-validation mean. Metrics are in AQI points for MAE and RMSE; R² is a relative fit statistic, not a percent accuracy. Test MAE was 27.141 for the selected random forest and 34.498 for persistence, a 21.33% reduction in MAE on this one historical test period. This does not establish future or other-city performance.

## Local development

Requirements: Node.js 20 or newer and npm. From the repository root:

```powershell
npm ci
npm run dev
```

Open the local address printed by Vite. To create and preview the static production build:

```powershell
npm run build
npm run preview
```

Run fast project checks with `npm test`. For browser-level checks, install Chromium once with `npx playwright install chromium`, build with `npm run build`, then run `npm run test:e2e` against Vite's production preview. The checks do not download data or call an external service.

## Model reproduction

The web dashboard consumes exported, browser-readable model and historical artifacts; it does not train a model in the browser. To reproduce the Python experiment, obtain the source `city_day.csv` from the [Kaggle dataset](https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india) and save it at `data/raw/city_day.csv`. The Kaggle metadata API reported the dataset as CC0 Public Domain on 8 October 2026; check the source page and metadata again before reusing the data, and retain attribution. Pollutant units are taken from the supplied file and have not been independently verified.

On Windows PowerShell, install the locked environment and run:

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-lock.txt
./.venv/Scripts/python.exe -m unittest discover -s tests -v
./.venv/Scripts/python.exe -m src.train --data data/raw/city_day.csv --city Delhi
./.venv/Scripts/python.exe -m src.verify_model
./.venv/Scripts/python.exe scripts/export_dashboard.py
```

The prepared target pairs a city's reading on date *d* with its AQI on exactly *d + 1*. Rows with missing current or next-day AQI are omitted. The chronological split has 1,395 training, 299 validation, and 299 test rows. Candidate models are selected by validation MAE; the selected pipeline is refit on training plus validation before the test is evaluated once. Test dates run from 7 September 2019 through 1 July 2020. See [reports/RESULTS.md](../reports/RESULTS.md) for the measured results and [PROJECT_GUIDE.md](../PROJECT_GUIDE.md) for the experiment design.

The exporter writes `public/data/manifest.json`, one JSON file for every city, `model.json`, `model-report.json`, and `parity-cases.json`. It builds these from the downloaded CSV and fitted pipeline, preserves source nulls, and checks browser predictions against the fitted Python pipeline. The compact export mirrors preprocessing with training-median imputation and missingness indicators followed by the trained random forest; float32 values are used for tree comparisons. The checked-in parity report covers every held-out test row plus edge cases. Do not call the exported JavaScript implementation a newly trained model.

## College demonstration checklist

The **About this atlas** page includes the project workflow as a responsive flowchart. The [desktop diagram](screenshots/workflow-desktop.png) and [mobile diagram](screenshots/workflow-mobile.png) can be reused in a project report or presentation; the README also includes an editable Mermaid version.

1. Open the home dashboard and explain that the history is a dated dataset, not live monitoring.
2. Select multiple cities, then compare a year view with an exact date. Point out where dates or measurements are missing.
3. Explain AQI and pollutant charts, units as supplied by the dataset, and any visible source caveat.
4. Open **About this atlas** and walk through the project flowchart: Kaggle source, pandas cleaning, separate archive and Delhi-model paths, chronological split, training and validation, held-out evaluation, verified export, and dashboard. Explain why imputation is fitted after splitting and why the final test is withheld from model selection.
5. Open the model report. Explain the exact next-day target, chronological train/validation/test periods, persistence baseline, MAE/RMSE, and why R² is not accuracy percentage.
6. Use the Delhi forecast form with a date and today's AQI. Pollutant fields are optional; blank fields use training medians. Show the predicted target date and scenario label. Try an invalid or missing AQI input to demonstrate validation.
7. Export a CSV and open it to confirm that it contains the selected historical records and labels.
8. Resize to a phone-width viewport and check that filters, charts, and navigation remain usable.

## Troubleshooting

- **Blank page after a change:** stop Vite with Ctrl+C, run `npm ci` and `npm run dev`, then check the browser console and terminal output.
- **Build cannot find a data artifact:** confirm that the generated bundle/manifest files are present and that their paths match the imports in the Vite app. Do not substitute hand-written sample observations for missing training data.
- **A historical measurement has no value:** there is no AQI or pollutant observation for that field; the dashboard should report it as unavailable.
- **Forecast is unavailable:** the trained model is Delhi-only and needs today's AQI. The six pollutant fields may be absent and are imputed by the saved training pipeline, but the UI should disclose when imputation is used.
- **Vercel build fails:** set the project root to the repository root, use `npm run build`, and leave the output directory at Vite's default `dist`. No Python build step or environment secret is required for the static site.

## Hosting

For the current project demo, run `npm run dev` on the computer presenting the project and open Vite's local URL in a browser. The production preview is available through `npm run build` followed by `npm run preview`. A Vercel static deployment can be added later using the repository root and Vite's default `dist` output; a successful local build does not itself publish the site.
