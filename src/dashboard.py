"""Shared dashboard formatting; raw model predictions remain unchanged."""
import math
from datetime import timedelta


def category(value):
    """CPCB display bands using nearest integer, with halves rounded upward."""
    if not math.isfinite(value) or not 0 <= value <= 500:
        return "Outside 0–500"
    displayed = math.floor(value + 0.5)
    for upper, name in [(50, "Good"), (100, "Satisfactory"), (200, "Moderate"),
                        (300, "Poor"), (400, "Very Poor"), (500, "Severe")]:
        if displayed <= upper:
            return name


def forecast_output(frame, predictions):
    """Build a downloadable forecast without clipping or rounding numeric values."""
    import pandas as pd
    output = frame.copy()
    dates = pd.to_datetime(output["Date"], errors="raise")
    if dates.isna().any():
        raise ValueError("Observation dates cannot be missing")
    output["forecast_date"] = (dates + timedelta(days=1)).dt.strftime("%Y-%m-%d")
    output["predicted_next_day_aqi"] = predictions
    output["category"] = [category(float(value)) for value in predictions]
    output["outside_0_500"] = ~output.predicted_next_day_aqi.between(0, 500)
    return output
