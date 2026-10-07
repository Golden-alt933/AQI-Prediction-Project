"""Verify the saved model against recorded predictions in a fresh process."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from .predict import predict_frame


def main():
    frame = pd.read_csv("data/processed/test.csv")
    model_path = Path("models/aqi_pipeline.joblib")
    metadata_path = Path("models/model_metadata.json")
    actual = predict_frame(frame, model_path, metadata_path)
    expected = pd.read_csv("reports/test_predictions.csv").model_prediction.to_numpy()
    np.testing.assert_allclose(actual, expected, rtol=1e-12, atol=1e-12)
    checks = {"fresh_process_predictions_match": True}
    for label, changed in [
        ("missing_column", frame.drop(columns=["aqi_today"])),
        ("wrong_city", frame.assign(City="A city outside the model scope")),
        ("negative_input", frame.assign(CO=-1)),
        ("missing_current_aqi", frame.assign(aqi_today=np.nan)),
        ("infinite_input", frame.assign(CO=np.inf)),
    ]:
        try:
            predict_frame(changed, model_path, metadata_path)
        except ValueError:
            checks[label + "_rejected"] = True
        else:
            raise AssertionError(label + " was accepted")
    missing_pollutants = frame.iloc[[0]].copy()
    for column in ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"]:
        missing_pollutants[column] = np.nan
    if not np.isfinite(predict_frame(missing_pollutants, model_path, metadata_path)).all():
        raise AssertionError("Missing pollutant inputs did not produce finite predictions")
    checks["missing_pollutants_imputed"] = True
    Path("reports/inference_verification.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
