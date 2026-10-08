"""Export clean public dashboard data and the fitted Delhi forest for browser inference."""
from __future__ import annotations

import json
import hashlib
import math
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.prepare_data import POLLUTANTS  # noqa: E402

RAW = ROOT / "data/raw/city_day.csv"
PIPELINE = ROOT / "models/aqi_pipeline.joblib"
PUBLIC = ROOT / "public/data"
FEATURES = POLLUTANTS + ["aqi_today"]
SOURCE_URL = "https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india"
LICENSE_API = "https://www.kaggle.com/api/v1/datasets/list?search=air-quality-data-in-india"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
LICENSE_RETRIEVED = "2026-10-08"

CITY_INFO = {
    "Ahmedabad": ("Gujarat", 23.0225, 72.5714), "Amaravati": ("Andhra Pradesh", 16.5062, 80.6480),
    "Amritsar": ("Punjab", 31.6340, 74.8723), "Aizawl": ("Mizoram", 23.7271, 92.7176),
    "Bengaluru": ("Karnataka", 12.9716, 77.5946), "Bhopal": ("Madhya Pradesh", 23.2599, 77.4126),
    "Brajrajnagar": ("Odisha", 21.8167, 83.9167), "Chandigarh": ("Chandigarh", 30.7333, 76.7794),
    "Chennai": ("Tamil Nadu", 13.0827, 80.2707), "Coimbatore": ("Tamil Nadu", 11.0168, 76.9558),
    "Delhi": ("Delhi", 28.6139, 77.2090), "Ernakulam": ("Kerala", 9.9816, 76.2999),
    "Gurugram": ("Haryana", 28.4595, 77.0266), "Guwahati": ("Assam", 26.1445, 91.7362),
    "Hyderabad": ("Telangana", 17.3850, 78.4867), "Jaipur": ("Rajasthan", 26.9124, 75.7873),
    "Jorapokhar": ("Jharkhand", 23.7000, 86.4000), "Kochi": ("Kerala", 9.9312, 76.2673),
    "Kolkata": ("West Bengal", 22.5726, 88.3639), "Lucknow": ("Uttar Pradesh", 26.8467, 80.9462),
    "Mumbai": ("Maharashtra", 19.0760, 72.8777), "Patna": ("Bihar", 25.5941, 85.1376),
    "Shillong": ("Meghalaya", 25.5788, 91.8933), "Talcher": ("Odisha", 20.9517, 85.2333),
    "Thiruvananthapuram": ("Kerala", 8.5241, 76.9366), "Visakhapatnam": ("Andhra Pradesh", 17.6868, 83.2185),
}


def dump(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def city_id(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def clean_source():
    metadata = json.loads((ROOT / "models/model_metadata.json").read_text(encoding="utf-8"))
    actual_hash = hashlib.sha256(RAW.read_bytes()).hexdigest()
    if metadata.get("data_sha256") != actual_hash:
        raise ValueError("Source CSV differs from the data used to train the saved model; retrain before exporting")
    if metadata.get("city") != "Delhi" or metadata.get("horizon_days") != 1:
        raise ValueError("The dashboard export requires the saved Delhi one-calendar-day model")
    raw = pd.read_csv(RAW)
    required = {"City", "Date", "AQI", *POLLUTANTS}
    if missing := required.difference(raw.columns):
        raise ValueError(f"Source CSV lacks required columns: {sorted(missing)}")
    if raw["City"].isna().any():
        raise ValueError("Source contains rows without a city")
    raw["Date"] = pd.to_datetime(raw["Date"], errors="raise")
    if raw["Date"].isna().any():
        raise ValueError("Source contains missing observation dates")
    result = {}
    for city, group in raw.groupby("City", sort=True):
        if city not in CITY_INFO:
            raise ValueError(f"No verified region metadata configured for source city {city!r}")
        group = group.copy()
        group = group.drop_duplicates()
        if group.duplicated(["City", "Date"]).any():
            raise ValueError(f"Conflicting city/date rows found for {city}")
        for field in [*POLLUTANTS, "AQI"]:
            numeric = pd.to_numeric(group[field], errors="coerce")
            group[field] = numeric.mask(numeric.lt(0) | ~np.isfinite(numeric))
        group = group.sort_values("Date")
        rows = []
        for record in group.to_dict("records"):
            rows.append({"date": record["Date"].strftime("%Y-%m-%d"), "aqi": finite_or_none(record["AQI"]),
                         **{field: finite_or_none(record[field]) for field in POLLUTANTS}})
        state, latitude, longitude = CITY_INFO[city]
        result[city] = {
            "id": city_id(city), "name": city, "state": state, "latitude": latitude, "longitude": longitude,
            "startDate": rows[0]["date"], "endDate": rows[-1]["date"],
            "years": sorted({int(row["date"][:4]) for row in rows}), "recordCount": len(rows),
            "aqiCount": sum(row["aqi"] is not None for row in rows), "rows": rows,
        }
    return result


def finite_or_none(value):
    return float(value) if value is not None and not pd.isna(value) and math.isfinite(float(value)) else None


def export_model(cities):
    if not PIPELINE.exists():
        raise FileNotFoundError(f"Trained model missing: {PIPELINE}")
    pipeline = joblib.load(PIPELINE)
    imputer = pipeline.named_steps["imputer"]
    forest = pipeline.named_steps["regressor"]
    if list(pipeline.feature_names_in_) != FEATURES:
        raise ValueError(f"Unexpected model features/order: {pipeline.feature_names_in_.tolist()}")
    model = {
        "version": 1, "features": FEATURES, "medians": [float(v) for v in imputer.statistics_],
        "indicatorFeatures": [int(v) for v in imputer.indicator_.features_],
        "trees": [],
    }
    for estimator in forest.estimators_:
        tree = estimator.tree_
        model["trees"].append({
            "left": tree.children_left.astype(int).tolist(), "right": tree.children_right.astype(int).tolist(),
            "feature": tree.feature.astype(int).tolist(), "threshold": tree.threshold.tolist(),
            "value": tree.value[:, 0, 0].tolist(),
        })
    dump(PUBLIC / "model.json", model)

    test = pd.read_csv(ROOT / "data/processed/test.csv")
    predictions = pipeline.predict(test[FEATURES])
    if len(predictions) != 299:
        raise ValueError(f"Expected 299 held-out rows; got {len(predictions)}")
    parity_cases = []
    for (_, row), predicted in zip(test.iterrows(), predictions):
        readings = {field: finite_or_none(row[field]) for field in FEATURES}
        parity_cases.append({"readings": readings, "expected": float(predicted), "date": str(row["target_date"])[:10]})
    # Explicit null-pattern coverage and extreme values exercise missing indicators and tree boundaries.
    fixtures = [
        {"aqi_today": 180, "PM2.5": None, "PM10": None, "NO2": None, "SO2": None, "CO": None, "O3": None},
        {"aqi_today": 500, "PM2.5": 1000, "PM10": 1500, "NO2": 500, "SO2": 250, "CO": 20, "O3": 500},
        {"aqi_today": 0, "PM2.5": 0, "PM10": 0, "NO2": 0, "SO2": 0, "CO": 0, "O3": 0},
    ]
    fixtures.extend({"aqi_today": 150, field: None} for field in POLLUTANTS)
    for readings in fixtures:
        expected = float(pipeline.predict(pd.DataFrame([readings], columns=FEATURES))[0])
        parity_cases.append({"readings": readings, "expected": expected, "kind": "null-or-extreme"})

    js_cases_path = PUBLIC / "parity-cases.json"
    dump(js_cases_path, parity_cases)
    # Execute the actual browser implementation under Node to verify every held-out and fixture prediction.
    import subprocess
    node = ["node", "--input-type=module", "-e", (
        "import fs from 'node:fs'; import {predictAQI} from './src/web/lib/model.mjs'; "
        "const model=JSON.parse(fs.readFileSync('./public/data/model.json','utf8')); "
        "const cases=JSON.parse(fs.readFileSync('./public/data/parity-cases.json','utf8')); "
        "const diffs=cases.map(c=>Math.abs(predictAQI(model,c.readings)-c.expected)); "
        "console.log(JSON.stringify({count:diffs.length,maxAbsError:Math.max(...diffs)}));"
    )]
    result = subprocess.run(node, cwd=ROOT, check=True, capture_output=True, text=True)
    parity = json.loads(result.stdout)
    tolerance = 1e-8
    if parity["count"] != len(parity_cases) or parity["maxAbsError"] > tolerance:
        raise AssertionError(f"Browser inference parity failed: {parity}")
    test_truth = test["aqi_next_day"].to_numpy(dtype=float)
    persistence = test["aqi_today"].to_numpy(dtype=float)
    parity["verified"] = True
    parity["tolerance"] = tolerance
    parity["heldoutCases"] = len(test)
    parity["fixtureCases"] = len(parity_cases) - len(test)
    parity["mae"] = float(mean_absolute_error(test_truth, predictions))
    parity["persistenceMae"] = float(mean_absolute_error(test_truth, persistence))
    report_metadata = json.loads((ROOT / "models/model_metadata.json").read_text(encoding="utf-8"))
    metrics = json.loads((ROOT / "reports/test_metrics.json").read_text(encoding="utf-8"))
    importance = pd.read_csv(ROOT / "reports/validation_feature_importance.csv").rename(columns={"increase_in_mae": "increase_in_mae"})
    report = {"metadata": report_metadata, "metrics": metrics,
              "importance": [{"feature": row["feature"], "increase_in_mae": float(row["increase_in_mae"]), "std": float(row["std"])} for row in importance.to_dict("records")],
              "predictions": [{"date": case["date"], "actual": finite_or_none(truth), "predicted": float(pred), "persistence": finite_or_none(persist)}
                             for case, truth, pred, persist in zip(parity_cases[:len(test)], test_truth, predictions, persistence)],
              "parity": parity}
    dump(PUBLIC / "model-report.json", report)


def main():
    cities = clean_source()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for city, payload in cities.items():
        dump(PUBLIC / "cities" / f"{payload['id']}.json", {"city": city, "rows": payload["rows"]})
    manifest = {
        "cities": [{key: value[key] for key in ["id", "name", "state", "latitude", "longitude", "startDate", "endDate", "years", "recordCount", "aqiCount"]}
                   for value in cities.values()],
        "source": {"name": "Air Quality Data in India (Rohan Rao)", "url": SOURCE_URL,
                   "sha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
                   "license": "CC0: Public Domain", "licenseUrl": LICENSE_URL,
                   "licenseMetadataUrl": LICENSE_API, "licenseMetadataRetrieved": LICENSE_RETRIEVED,
                   "dateRange": [min(c["startDate"] for c in cities.values()), max(c["endDate"] for c in cities.values())]},
        "pollutants": POLLUTANTS,
    }
    dump(PUBLIC / "manifest.json", manifest)
    export_model(cities)
    print(json.dumps({"cities": len(cities), "records": sum(c["recordCount"] for c in cities.values()),
                      "parity": json.loads((PUBLIC / "model-report.json").read_text())["parity"]}, indent=2))


if __name__ == "__main__":
    main()
