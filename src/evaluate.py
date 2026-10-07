"""Metrics and figures for training, validation and final evaluation."""
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def metrics(actual, predicted):
    mse = mean_squared_error(actual, predicted)
    return {"MAE": float(mean_absolute_error(actual, predicted)), "MSE": float(mse),
            "RMSE": float(np.sqrt(mse)), "R2": float(r2_score(actual, predicted))}


def save_figure(path):
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()


def eda(train, features, folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    train[features].isna().mean().mul(100).plot.bar(figsize=(8, 4), color="#2171b5")
    plt.ylabel("Missing values (%)"); plt.title("Training input coverage")
    save_figure(folder / "training_missingness.png")
    train.aqi_next_day.plot.hist(bins=30, figsize=(7, 4), color="#2171b5")
    plt.xlabel("Next-day AQI"); plt.title("Training target distribution")
    save_figure(folder / "training_aqi_distribution.png")
    correlation = train[features + ["aqi_next_day"]].corr()
    fig, ax = plt.subplots(figsize=(8, 7))
    plot = ax.imshow(correlation, vmin=-1, vmax=1, cmap="RdBu_r")
    ax.set_xticks(range(len(correlation)), correlation.columns, rotation=65, ha="right")
    ax.set_yticks(range(len(correlation)), correlation.columns)
    fig.colorbar(plot, ax=ax); ax.set_title("Training correlations")
    save_figure(folder / "training_correlations.png")
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, pollutant in zip(axes, ["PM2.5", "PM10"]):
        ax.scatter(train[pollutant], train.aqi_next_day, s=8, alpha=.35)
        ax.set(xlabel=f"Today's {pollutant} (source units)", ylabel="Tomorrow's AQI")
    save_figure(folder / "training_pollutants_vs_target.png")
    train.groupby(train.target_date.dt.month).aqi_next_day.mean().plot.bar(figsize=(8, 4))
    plt.ylabel("Mean next-day AQI"); plt.xlabel("Month"); plt.title("Training seasonal pattern")
    save_figure(folder / "training_monthly_aqi.png")


def final_plots(predictions, folder):
    fig, ax = plt.subplots(figsize=(11, 4))
    for column in ["actual", "model_prediction", "persistence_prediction"]:
        ax.plot(pd.to_datetime(predictions.target_date), predictions[column], label=column, linewidth=1)
    ax.set(ylabel="AQI", title="Held-out next-day forecasts"); ax.legend()
    save_figure(folder / "test_timeline.png")
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    axes[0].scatter(predictions.actual, predictions.model_prediction, s=10, alpha=.5)
    limits = [min(predictions.actual.min(), predictions.model_prediction.min()),
              max(predictions.actual.max(), predictions.model_prediction.max())]
    axes[0].plot(limits, limits, "k--"); axes[0].set(xlabel="Actual AQI", ylabel="Predicted AQI")
    axes[1].scatter(predictions.model_prediction, predictions.actual - predictions.model_prediction, s=10, alpha=.5)
    axes[1].axhline(0, color="k", linestyle="--"); axes[1].set(xlabel="Predicted AQI", ylabel="Residual (actual - predicted)")
    save_figure(folder / "test_scatter_residuals.png")
