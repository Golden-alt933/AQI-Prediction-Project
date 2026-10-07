"""Prepare exact-calendar next-day labels without using future features."""
from pathlib import Path
import hashlib
import numpy as np
import pandas as pd

POLLUTANTS = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"]
FEATURES = POLLUTANTS + ["aqi_today"]


def prepare(path: Path, city: str = "Delhi"):
    raw = pd.read_csv(path)
    required = {"City", "Date", "AQI", *POLLUTANTS}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    audit = {"source": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
             "raw_rows": len(raw), "columns": raw.columns.tolist(),
             "city_counts": raw.City.value_counts().to_dict(), "city": city}
    daily = raw.loc[raw.City.eq(city)].copy()
    if daily.empty:
        raise ValueError(f"City {city!r} absent from dataset")
    audit["city_rows_before_cleaning"] = len(daily)
    daily["Date"] = pd.to_datetime(daily.Date, errors="raise")
    if daily.Date.isna().any():
        raise ValueError("Missing dates")
    before = len(daily)
    daily = daily.drop_duplicates()
    audit["exact_duplicates_removed"] = before - len(daily)
    if daily.duplicated(["City", "Date"]).any():
        raise ValueError("Conflicting city/date duplicates require manual review")
    audit["invalid_values_replaced"] = {}
    for column in POLLUTANTS + ["AQI"]:
        numeric = pd.to_numeric(daily[column], errors="coerce")
        invalid = numeric.lt(0) | ~np.isfinite(numeric)
        audit["invalid_values_replaced"][column] = int((invalid & daily[column].notna()).sum())
        daily[column] = numeric.mask(invalid)
    daily = daily.sort_values("Date")
    audit["date_range"] = [str(daily.Date.min().date()), str(daily.Date.max().date())]
    audit["missing_percent"] = (daily[POLLUTANTS + ["AQI"]].isna().mean() * 100).to_dict()
    audit["numeric_summary"] = daily[POLLUTANTS + ["AQI"]].describe().to_dict()
    audit["observed_aqi_above_500_retained"] = int(daily.AQI.gt(500).sum())
    labels = daily[["City", "Date", "AQI"]].rename(columns={"Date": "target_date", "AQI": "aqi_next_day"})
    samples = daily.rename(columns={"AQI": "aqi_today"}).copy()
    samples["target_date"] = samples.Date + pd.Timedelta(days=1)
    samples = samples.merge(labels, on=["City", "target_date"], how="left", validate="one_to_one")
    audit["missing_today_aqi"] = int(samples.aqi_today.isna().sum())
    audit["missing_next_day_aqi"] = int(samples.aqi_next_day.isna().sum())
    samples = samples.dropna(subset=["aqi_today", "aqi_next_day"])
    samples = samples[["City", "Date", "target_date", *FEATURES, "aqi_next_day"]].sort_values("target_date").reset_index(drop=True)
    audit["eligible_rows"] = len(samples)
    audit["rows_removed_for_missing_current_or_next_aqi"] = len(daily) - len(samples)
    return daily, samples, audit


def temporal_split(samples):
    dates = samples.target_date.drop_duplicates().sort_values().to_numpy()
    if len(dates) < 100:
        raise ValueError("Need at least 100 usable target dates for this experiment")
    first, second = int(len(dates) * .70), int(len(dates) * .85)
    train = samples[samples.target_date < dates[first]].copy()
    validation = samples[(samples.target_date >= dates[first]) & (samples.target_date < dates[second])].copy()
    test = samples[samples.target_date >= dates[second]].copy()
    if train.target_date.max() > validation.Date.min() or validation.target_date.max() > test.Date.min():
        raise ValueError("Labels are unavailable at the next period's forecast origin")
    metadata = {}
    for name, frame in [("train", train), ("validation", validation), ("test", test)]:
        metadata[name] = {"rows": len(frame), "origin_start": str(frame.Date.min().date()),
                          "origin_end": str(frame.Date.max().date()),
                          "target_start": str(frame.target_date.min().date()),
                          "target_end": str(frame.target_date.max().date())}
    return train, validation, test, metadata
