"""Reproduce the Delhi forecast experiment with a held-out future test period."""
import argparse
import json
import platform
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import sklearn
import matplotlib.pyplot as plt
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from .prepare_data import prepare, temporal_split, FEATURES
from .evaluate import metrics, eda, final_plots, save_figure


def pipeline(estimator, linear=False):
    steps = [("imputer", SimpleImputer(strategy="median", add_indicator=True))]
    if linear:
        steps.append(("scaler", StandardScaler()))
    return Pipeline(steps + [("regressor", estimator)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data/raw/city_day.csv"))
    parser.add_argument("--city", default="Delhi")
    parser.add_argument("--output", type=Path, default=Path("."))
    args = parser.parse_args()
    output = args.output
    reports, figures, models = output / "reports", output / "reports/figures", output / "models"
    processed = output / "data/processed"
    for folder in [reports, figures, models, processed]:
        folder.mkdir(parents=True, exist_ok=True)
    daily, samples, audit = prepare(args.data, args.city)
    train, validation, test, splits = temporal_split(samples)
    empty = [feature for feature in FEATURES if train[feature].isna().all()]
    features = [feature for feature in FEATURES if feature not in empty]
    audit["all_missing_training_features_excluded"] = empty
    (reports / "data_audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
    cleaning_lines = ["# Data preparation and cleaning", "", f"Source CSV: {audit['raw_rows']} rows across {len(audit['city_counts'])} cities.",
                      f"Selected city: {args.city}; {audit['city_rows_before_cleaning']} original daily records.",
                      f"Date range: {audit['date_range'][0]} through {audit['date_range'][1]}.",
                      f"Removed exact duplicates: {audit['exact_duplicates_removed']}.",
                      "Conflicting city/date duplicates cause an error rather than silent averaging.",
                      f"Eligible next-day samples: {len(samples)}; removed for missing current or next-day AQI: {audit['rows_removed_for_missing_current_or_next_aqi']}.",
                      "Targets join on the same city and exactly the next calendar day; a gap is never treated as tomorrow.",
                      "Negative, infinite and nonnumeric readings are replaced with missing values. Genuine high readings are retained.",
                      f"Observed AQI above 500: {audit['observed_aqi_above_500_retained']} records, retained as source labels and flagged for source verification.",
                      "Missing targets and current AQI are never imputed. Pollutant medians and missingness indicators are fitted inside each pipeline.",
                      "", "| Field | Missing % in city data | Invalid values replaced |", "|---|---:|---:|"]
    for field, missing_percent in audit["missing_percent"].items():
        cleaning_lines.append(f"| {field} | {missing_percent:.3f} | {audit['invalid_values_replaced'][field]} |")
    cleaning_lines += ["", f"Entirely missing training inputs excluded: {empty or 'none'}.",
                       f"Raw-file SHA-256: `{audit['sha256']}`."]
    (reports / "cleaning_log.md").write_text("\n".join(cleaning_lines) + "\n", encoding="utf-8")
    (reports / "split_metadata.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")
    samples.to_csv(processed / "forecast_samples.csv", index=False)
    for name, frame in [("train", train), ("validation", validation), ("test", test)]:
        frame.to_csv(processed / f"{name}.csv", index=False)
    eda(train, features, figures)
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(daily.Date, daily.AQI, linewidth=1)
    for label, frame in [("Validation starts", validation), ("Test starts", test)]:
        ax.axvline(frame.target_date.min(), linestyle="--", label=label)
    ax.set(ylabel="Observed AQI", title=f"{args.city}: historical coverage and fixed split dates"); ax.legend()
    save_figure(figures / "data_timeline_splits.png")

    ytrain, yval = train.aqi_next_day, validation.aqi_next_day
    rows = []
    for name, predicted in [("Training mean", np.full(len(validation), ytrain.mean())),
                            ("Persistence", validation.aqi_today.to_numpy())]:
        rows.append({"model": name, "feature_set": "baseline", "training_seconds": 0., **metrics(yval, predicted)})
    candidates = []
    feature_sets = {"AQI only": ["aqi_today"], "AQI plus pollutants": features}
    # A small fixed search is chosen before observing validation or test errors.
    for feature_name, columns in feature_sets.items():
        configurations = [("Linear Regression", pipeline(LinearRegression(), linear=True)),
                          ("Random Forest depth10 leaf5", pipeline(RandomForestRegressor(n_estimators=200, max_depth=10, min_samples_leaf=5, random_state=42, n_jobs=2))),
                          ("Random Forest unrestricted leaf1", pipeline(RandomForestRegressor(n_estimators=200, min_samples_leaf=1, random_state=42, n_jobs=2))),
                          ("Gradient Boosting depth2", pipeline(GradientBoostingRegressor(n_estimators=150, max_depth=2, learning_rate=.05, random_state=42))),
                          ("Gradient Boosting depth3", pipeline(GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=.05, random_state=42)))]
        for name, model in configurations:
            started = time.perf_counter()
            model.fit(train[columns], ytrain)
            elapsed = time.perf_counter() - started
            scores = metrics(yval, model.predict(validation[columns]))
            row = {"model": name, "feature_set": feature_name, "training_seconds": elapsed, **scores}
            rows.append(row); candidates.append((scores["MAE"], name, feature_name, columns, model))
            print(f"{name}, {feature_name}: validation MAE={scores['MAE']:.3f}", flush=True)
    comparison = pd.DataFrame(rows).sort_values("MAE")
    comparison.to_csv(reports / "validation_results.csv", index=False)
    _, name, feature_name, columns, selected = min(candidates, key=lambda candidate: candidate[0])
    importance = permutation_importance(selected, validation[columns], yval, scoring="neg_mean_absolute_error", n_repeats=10, random_state=42, n_jobs=1)
    importance_frame = pd.DataFrame({"feature": columns, "increase_in_mae": importance.importances_mean,
                                     "std": importance.importances_std}).sort_values("increase_in_mae")
    importance_frame.to_csv(reports / "validation_feature_importance.csv", index=False)
    plt.figure(figsize=(8, 4))
    plt.barh(importance_frame.feature, importance_frame.increase_in_mae, xerr=importance_frame["std"])
    plt.xlabel("Increase in validation MAE after shuffling"); plt.title("Selected model: permutation importance")
    save_figure(figures / "validation_feature_importance.png")
    ablation = comparison[comparison.feature_set.ne("baseline")].groupby("feature_set").MAE.min()
    ablation.plot.bar(figsize=(7, 4)); plt.ylabel("Best validation MAE"); plt.title("Do pollutant inputs add forecasting value?")
    save_figure(figures / "validation_ablation.png")
    development = pd.concat([train, validation], ignore_index=True)
    selected.fit(development[columns], development.aqi_next_day)
    predicted = selected.predict(test[columns])
    test_scores = {"selected_model": metrics(test.aqi_next_day, predicted),
                   "persistence": metrics(test.aqi_next_day, test.aqi_today),
                   "development_mean": metrics(test.aqi_next_day, np.full(len(test), development.aqi_next_day.mean()))}
    improvement = 100 * (test_scores["persistence"]["MAE"] - test_scores["selected_model"]["MAE"]) / test_scores["persistence"]["MAE"] if test_scores["persistence"]["MAE"] else None
    predictions = test[["City", "Date", "target_date"]].copy()
    predictions["actual"] = test.aqi_next_day
    predictions["model_prediction"] = predicted
    predictions["persistence_prediction"] = test.aqi_today
    predictions["residual"] = test.aqi_next_day - predicted
    predictions.to_csv(reports / "test_predictions.csv", index=False)
    final_plots(predictions, figures)
    subgroup_rows = []
    for group_type, groups in [("month", test.target_date.dt.to_period("M").astype(str)),
                               ("actual_severity", pd.cut(test.aqi_next_day, [-np.inf, 50, 100, 200, 300, 400, 500, np.inf], labels=["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe", "Above 500"]).astype(str))]:
        for group in groups.unique():
            mask = groups.eq(group).to_numpy()
            subgroup_rows.append({"group_type": group_type, "group": group, "count": int(mask.sum()),
                                  "model_MAE": float(np.abs(test.aqi_next_day.to_numpy()[mask] - predicted[mask]).mean()),
                                  "persistence_MAE": float(np.abs(test.aqi_next_day.to_numpy()[mask] - test.aqi_today.to_numpy()[mask]).mean())})
    pd.DataFrame(subgroup_rows).to_csv(reports / "test_errors_by_group.csv", index=False)
    joblib.dump(selected, models / "aqi_pipeline.joblib")
    metadata = {"city": args.city, "horizon_days": 1, "features": columns, "selected_model": name,
                "feature_set": feature_name, "selection_rule": "Lowest validation MAE among ML candidates; baselines reported separately",
                "seed": 42, "splits": splits, "data_sha256": audit["sha256"],
                "versions": {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__, "sklearn": sklearn.__version__, "joblib": joblib.__version__},
                "parameters": selected.get_params()["regressor"].get_params(),
                "units": "Retained from supplied CSV; pollutant units have not been independently verified",
                "source_url": "https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india",
                "license": "Not verified from dataset metadata; verify before redistribution",
                "cleaning": "Drop exact duplicates; reject conflicting dates; invalid/negative numeric readings to missing; never impute target; impute pollutants inside fitted pipeline",
                "test_metrics": test_scores, "test_mae_improvement_over_persistence_percent": improvement,
                "out_of_range_predictions": int(((predicted < 0) | (predicted > 500)).sum())}
    (models / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (reports / "test_metrics.json").write_text(json.dumps(test_scores, indent=2), encoding="utf-8")
    example = test.iloc[[0]][["City", "Date", *columns]].copy()
    example.to_csv(output / "example_input.csv", index=False)
    reloaded = joblib.load(models / "aqi_pipeline.joblib")
    np.testing.assert_allclose(reloaded.predict(test[columns]), predicted, rtol=1e-12, atol=1e-12)
    result_lines = ["# AQI forecast experiment results", "", f"Selected model: **{name}**, using **{feature_name}**.", "",
                    f"City: {args.city}. Forecast: next calendar day. Eligible samples: {len(samples)}.", "",
                    "## Final held-out test results", "", "| Predictor | MAE | RMSE | R² |", "|---|---:|---:|---:|"]
    for predictor, score in test_scores.items():
        result_lines.append(f"| {predictor} | {score['MAE']:.3f} | {score['RMSE']:.3f} | {score['R2']:.3f} |")
    result_lines += ["", f"MAE improvement over persistence: {improvement:.2f}%." if improvement is not None else "Persistence MAE is zero; relative improvement is undefined.", "",
                     "## Interpretation", "",
                     "A negative improvement means the ML model performed worse than persistence. The model was selected with validation data only, then refitted on training plus validation; test scores did not drive selection.", "",
                     "The AQI-only versus AQI-plus-pollutants experiment is in validation_results.csv and validation_ablation.png. Importance is measured on validation before the final refit.", "",
                     "## Limits", "", "Historical Delhi measurements do not establish present-day or other-city forecasting performance. Test days use the actual previous day's observations, as in a rolling daily forecast. Daily publication delays are not modeled. Severe episodes and missing readings limit reliability. The 2020 test period may reflect unusual conditions; no causal claim is made.", "",
                     "Pollutant units and dataset license still need source-metadata verification. Predictions are evaluated without clipping. Today's AQI must be available at forecast time.", "",
                     f"The source contains {audit['observed_aqi_above_500_retained']} city AQI records above 500. These labels are retained; their derivation requires source verification before interpretation against official display bands.", "",
                     "## Artifacts", "", "See data_audit.json, split_metadata.json, validation_results.csv, test_metrics.json, test_predictions.csv, test_errors_by_group.csv, and figures/. The saved pipeline passed prediction-equivalence checks after reloading."]
    (reports / "RESULTS.md").write_text("\n".join(result_lines) + "\n", encoding="utf-8")
    print(json.dumps({"selected": name, "feature_set": feature_name, "test": test_scores, "improvement_percent": improvement}, indent=2))


if __name__ == "__main__":
    main()
