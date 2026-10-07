"""Delhi AQI research dashboard. Run with streamlit run app.py."""
import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.dashboard import category, forecast_output
from src.predict import predict_frame

ROOT = Path(__file__).resolve().parent
st.set_page_config(page_title="Delhi AQI · Forecast lab", page_icon="◌", layout="wide")
st.markdown("""<style>
.block-container {padding-top:2.5rem; max-width:1440px;}
h1 {letter-spacing:-.045em;} h2,h3 {letter-spacing:-.025em;}
[data-testid="stMetric"] {border:1px solid #dbe4e2; border-radius:12px; padding:18px;}
[data-testid="stSidebar"] {border-right:1px solid #dbe4e2;}
</style>""", unsafe_allow_html=True)


@st.cache_data
def read_csv(path, modified):
    return pd.read_csv(path)


def report(name):
    path = ROOT / "reports" / name
    return read_csv(str(path), path.stat().st_mtime_ns)


@st.cache_resource
def load_model(path, modified):
    return joblib.load(path)


def forecast(frame):
    path = ROOT / "models/aqi_pipeline.joblib"
    model = load_model(str(path), path.stat().st_mtime_ns)
    predictions = predict_frame(frame, path, ROOT / "models/model_metadata.json", model=model)
    return forecast_output(frame, predictions)


def chart(fig):
    fig.update_layout(margin=dict(l=10, r=10, t=45, b=10), height=360,
                      legend=dict(orientation="h", y=-.2),
                      colorway=["#087f70", "#df9745", "#88989a"])
    st.plotly_chart(fig, width="stretch")


def main():
    try:
        metadata = json.loads((ROOT / "models/model_metadata.json").read_text())
        predictions = report("test_predictions.csv")
        predictions["target_date"] = pd.to_datetime(predictions.target_date)
    except (OSError, ValueError, KeyError) as exc:
        st.error(f"Dashboard reports could not be loaded: {exc}")
        st.info("Restore the committed reports or run python -m src.train to regenerate them.")
        return
    model_ready = (ROOT / "models/aqi_pipeline.joblib").is_file()
    with st.sidebar:
        st.markdown("### AQI / Forecast lab")
        st.caption("DELHI · NEXT-DAY FORECAST")
        page = st.radio("Workspace", ["Overview", "Forecast", "Model & evidence"], label_visibility="collapsed", key="workspace")
        st.divider()
        st.markdown("**Historical research model**")
        st.caption("Saved evaluation: Sep 2019–Jul 2020. No live monitoring feed is connected.")
        st.markdown("**Pipeline available**" if model_ready else "**Report-only mode**")
        st.caption("Model: " + metadata["selected_model"])
        st.caption("Data fingerprint: " + metadata["data_sha256"][:12])
    st.caption("AIR QUALITY INTELLIGENCE / DELHI")
    st.title({"Overview": "Tomorrow’s air, understood.", "Forecast": "Explore a next-day forecast.",
              "Model & evidence": "The evidence behind the forecast."}[page])
    st.write("An offline forecasting experiment using today’s AQI and pollutant observations.")
    if page == "Overview":
        scores = metadata["test_metrics"]["selected_model"]
        cols = st.columns(4)
        cols[0].metric("Mean absolute error", f"{scores['MAE']:.2f}", help="Average absolute error in AQI points on all 299 test days.")
        cols[1].metric("Root mean squared error", f"{scores['RMSE']:.2f}")
        cols[2].metric("R² on held-out data", f"{scores['R2']:.3f}")
        cols[3].metric("MAE reduction vs persistence", f"{metadata['test_mae_improvement_over_persistence_percent']:.1f}%")
        st.subheader("Observed air quality and next-day forecasts")
        dates = st.slider("Test period", min_value=predictions.target_date.min().date(),
                          max_value=predictions.target_date.max().date(),
                          value=(predictions.target_date.min().date(), predictions.target_date.max().date()))
        view = predictions[predictions.target_date.dt.date.between(*dates)]
        series = view.rename(columns={"actual": "Observed AQI", "model_prediction": "Random Forest", "persistence_prediction": "Persistence"})
        chart(px.line(series, x="target_date", y=["Observed AQI", "Random Forest", "Persistence"],
                      labels={"target_date": "Forecast date", "value": "AQI (points)", "variable": "Series"}))
        st.caption("Source: saved held-out test predictions. Date filter changes charts only; headline metrics cover the full test period.")
        left, right = st.columns(2)
        with left:
            st.subheader("Where forecasts miss")
            fig = px.scatter(view, x="actual", y="model_prediction", hover_data=["target_date"],
                             labels={"actual": "Observed AQI (points)", "model_prediction": "Predicted AQI (points)"})
            maximum = max(view.actual.max(), view.model_prediction.max())
            fig.add_trace(go.Scatter(x=[0, maximum], y=[0, maximum], mode="lines", name="Perfect forecast", line=dict(dash="dash")))
            chart(fig)
        with right:
            st.subheader("Error across pollution levels")
            groups = report("test_errors_by_group.csv")
            groups = groups[groups.group_type.eq("actual_severity")]
            chart(px.bar(groups, x="group", y=["model_MAE", "persistence_MAE"], barmode="group",
                         labels={"group": "Observed AQI category", "value": "Mean absolute error (AQI points)", "variable": "Predictor"}))
            st.caption("Full test period; severity groups use actual AQI. Above-500 group contains only 7 days.")
        with st.expander("Inspect and download the selected period"):
            st.dataframe(view, width="stretch", hide_index=True)
            st.download_button("Download test predictions", view.to_csv(index=False), "test_predictions.csv", "text/csv")
    elif page == "Forecast":
        mode = st.radio("Input source", ["Historical replay", "Manual observations", "CSV upload"], horizontal=True, key="input_source")
        if mode == "Historical replay":
            st.info("Replay uses recorded predictions from the original held-out experiment; it does not run a new forecast.")
            chosen = st.selectbox("Forecast date", predictions.target_date.dt.strftime("%Y-%m-%d").tolist())
            row = predictions.loc[predictions.target_date.eq(pd.Timestamp(chosen))].iloc[0]
            cols = st.columns(3)
            cols[0].metric("Recorded prediction", f"{row.model_prediction:.1f}", help=category(float(row.model_prediction)))
            cols[1].metric("Observed AQI", f"{row.actual:.1f}")
            cols[2].metric("Absolute error", f"{abs(row.actual-row.model_prediction):.1f}")
            st.write(f"**Category:** {category(float(row.model_prediction))} · **Forecast date:** {chosen}")
            st.caption("Observation date: " + str(row.Date) + ". Category uses the documented integer display rule.")
        elif not model_ready:
            st.warning("The trained pipeline is missing. Historical replay and evaluation remain available.")
            st.code("python -m src.train --data data/raw/city_day.csv --city Delhi\npython -m src.verify_model")
        else:
            frame = None
            if mode == "Manual observations":
                st.caption("Enter Delhi observations in the dataset’s source units. Pollutant units have not been independently verified.")
                example = pd.read_csv(ROOT / "example_input.csv").iloc[0]
                with st.form("manual_forecast"):
                    origin = st.date_input("Observation date", value=date.today())
                    current = st.number_input("Today’s AQI (required)", min_value=0., value=float(example.aqi_today))
                    values = {"City": metadata["city"], "Date": origin.isoformat(), "aqi_today": current}
                    columns = st.columns(3)
                    for i, feature in enumerate(f for f in metadata["features"] if f != "aqi_today"):
                        with columns[i % 3]:
                            missing = st.checkbox(f"{feature} unavailable", key=f"missing_{feature}")
                            entered = st.number_input(feature, min_value=0., value=float(example.get(feature, 0)), disabled=missing)
                            values[feature] = np.nan if missing else entered
                    submitted = st.form_submit_button("Forecast next-day AQI", type="primary")
                if submitted:
                    frame = pd.DataFrame([values])
            else:
                st.write("Upload a CSV containing `City`, `Date` and all model features. Use Delhi for City; leave missing pollutant cells blank.")
                st.code(",".join(["City", "Date", *metadata["features"]]))
                st.download_button("Download input template", (ROOT / "example_input.csv").read_bytes(), "example_input.csv", "text/csv")
                upload = st.file_uploader("Observation CSV", type="csv")
                if upload is not None and st.button("Generate forecasts", type="primary"):
                    try:
                        frame = pd.read_csv(upload)
                        if not {"City", "Date"}.issubset(frame.columns):
                            raise ValueError("CSV must contain City and Date columns")
                        if frame.empty or len(frame) > 10000:
                            raise ValueError("Upload between 1 and 10,000 rows")
                    except (ValueError, pd.errors.ParserError) as exc:
                        st.error(f"Invalid CSV: {exc}")
                        frame = None
            if frame is not None:
                try:
                    output = forecast(frame)
                    st.success("Forecast complete")
                    if len(output) == 1:
                        row = output.iloc[0]
                        st.metric("Predicted next-day AQI", f"{row.predicted_next_day_aqi:.1f}")
                        st.write(f"**{row.category}** · Forecast for **{row.forecast_date}**")
                    if output.outside_0_500.any():
                        st.warning("Some predictions fall outside 0–500. They are flagged and retained without clipping.")
                    st.dataframe(output, hide_index=True, width="stretch")
                    st.download_button("Download forecasts", output.to_csv(index=False), "aqi_forecasts.csv", "text/csv", on_click="ignore")
                except (ValueError, OSError, KeyError) as exc:
                    st.error(f"Forecast could not be generated: {exc}")
        st.caption("Categories: [CPCB National AQI](https://www.airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf). Nearest integer, halves rounded upward; raw predictions remain unchanged. Values outside 0–500 receive no category.")
    else:
        left, right = st.columns([1.25, 1])
        with left:
            st.subheader("Model selection")
            st.write("Ten ML candidates were evaluated across two feature sets. Selection used validation MAE, followed by a refit on training plus validation.")
            comparison = report("validation_results.csv")
            st.dataframe(comparison[["model", "feature_set", "MAE", "RMSE", "R2"]].round(3), hide_index=True, width="stretch")
        with right:
            st.subheader("Which observations help?")
            importance = report("validation_feature_importance.csv").sort_values("increase_in_mae")
            chart(px.bar(importance, x="increase_in_mae", y="feature", orientation="h", error_x="std",
                         labels={"increase_in_mae": "MAE increase after shuffling (AQI points)", "feature": "Input"}))
            st.caption("Source: validation permutation importance, 10 repeats before final refit. Importance is predictive, not causal.")
        st.subheader("Time boundaries")
        splits = pd.DataFrame(metadata["splits"]).T
        st.dataframe(splits, width="stretch")
        st.subheader("Scope and limitations")
        st.write("Historical Delhi data does not establish present-day or other-city performance. Today’s AQI must be available at forecast time. Publication delays and weather inputs are not modeled. Extreme episodes have larger errors; 48 source records exceed AQI 500. Dataset licence and pollutant units remain unverified.")
        with st.expander("Model provenance and reproduction"):
            st.json(metadata)
            st.code("python -m src.train --data data/raw/city_day.csv --city Delhi\npython -m src.verify_model")
            st.download_button("Download model metadata", json.dumps(metadata, indent=2), "model_metadata.json", "application/json")


if __name__ == "__main__":
    main()
