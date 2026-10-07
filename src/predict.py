"""Inference from the fitted pipeline; input schema is stored with the model."""
import argparse
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd


def predict_frame(frame, model_path, metadata_path, *, model=None):
    """Validate inputs and infer, optionally reusing a cached fitted pipeline."""
    metadata = json.loads(Path(metadata_path).read_text(encoding="utf-8"))
    if "City" in frame and not frame.City.eq(metadata["city"]).all():
        raise ValueError(f"This model was trained for {metadata['city']}; City must match")
    features = metadata["features"]
    absent = set(features).difference(frame.columns)
    if absent:
        raise ValueError(f"Missing input columns: {sorted(absent)}")
    values = frame[features].apply(pd.to_numeric, errors="raise")
    if np.isinf(values.to_numpy()).any() or values.lt(0).any().any():
        raise ValueError("Inputs must be finite nonnegative readings or blank pollutants")
    if values.aqi_today.isna().any():
        raise ValueError("Today's AQI is required")
    if model is None:
        model = joblib.load(model_path)
    return model.predict(values)


def main():
    parser = argparse.ArgumentParser(description="Predict tomorrow's AQI from today's readings")
    parser.add_argument("--input", type=Path, required=True, help="CSV with the named feature columns")
    parser.add_argument("--model", type=Path, default=Path("models/aqi_pipeline.joblib"))
    parser.add_argument("--metadata", type=Path, default=Path("models/model_metadata.json"))
    parser.add_argument("--output", type=Path, default=Path("reports/new_predictions.csv"))
    args = parser.parse_args()
    frame = pd.read_csv(args.input)
    if "Date" in frame:
        origin = pd.to_datetime(frame.Date, errors="raise")
        if origin.isna().any():
            raise ValueError("Observation dates cannot be missing")
        frame["forecast_date"] = (origin + pd.Timedelta(days=1)).dt.strftime("%Y-%m-%d")
    frame["predicted_next_day_aqi"] = predict_frame(frame, args.model, args.metadata)
    frame["outside_0_500"] = ~frame.predicted_next_day_aqi.between(0, 500)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output, index=False)
    print(frame.to_string(index=False))


if __name__ == "__main__":
    main()
