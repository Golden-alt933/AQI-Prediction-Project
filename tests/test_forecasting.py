"""Checks the temporal contract and input validation, rather than model scores."""
import tempfile
import unittest
from pathlib import Path
import pandas as pd
from src.prepare_data import prepare, temporal_split, POLLUTANTS


class ForecastContractTests(unittest.TestCase):
    def write_data(self, folder, dates):
        frame = pd.DataFrame({"City": "Delhi", "Date": dates, "AQI": range(1, len(dates) + 1)})
        for column in POLLUTANTS:
            frame[column] = 10.
        path = Path(folder) / "data.csv"
        frame.to_csv(path, index=False)
        return path, frame

    def test_missing_calendar_day_is_not_a_next_day_label(self):
        with tempfile.TemporaryDirectory() as folder:
            path, _ = self.write_data(folder, ["2020-01-01", "2020-01-03", "2020-01-04"])
            _, samples, _ = prepare(path)
            self.assertEqual(len(samples), 1)
            self.assertEqual(samples.iloc[0].Date, pd.Timestamp("2020-01-03"))
            self.assertEqual(samples.iloc[0].aqi_next_day, 3)

    def test_conflicting_duplicates_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path, _ = self.write_data(folder, ["2020-01-01", "2020-01-01"])
            with self.assertRaisesRegex(ValueError, "Conflicting"):
                prepare(path)

    def test_future_labels_are_available_before_next_split(self):
        with tempfile.TemporaryDirectory() as folder:
            path, _ = self.write_data(folder, pd.date_range("2020-01-01", periods=200))
            _, samples, _ = prepare(path)
            train, validation, test, _ = temporal_split(samples)
            self.assertLessEqual(train.target_date.max(), validation.Date.min())
            self.assertLessEqual(validation.target_date.max(), test.Date.min())
            self.assertTrue((samples.target_date - samples.Date).eq(pd.Timedelta(days=1)).all())
            self.assertEqual(len(train) + len(validation) + len(test), len(samples))


if __name__ == "__main__":
    unittest.main()
