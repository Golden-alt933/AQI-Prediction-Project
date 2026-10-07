"""Dashboard contracts and Streamlit flows; no historical model required."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from streamlit.testing.v1 import AppTest

from src.dashboard import category, forecast_output
from src.predict import predict_frame

ROOT = Path(__file__).resolve().parents[1]


class DashboardTests(unittest.TestCase):
    def test_category_boundaries_and_out_of_range(self):
        for value, expected in [(0, 'Good'), (50.49, 'Good'), (50.5, 'Satisfactory'),
                                (100.5, 'Moderate'), (200.5, 'Poor'), (300.5, 'Very Poor'),
                                (400.5, 'Severe'), (500, 'Severe'), (500.01, 'Outside 0–500'),
                                (-.01, 'Outside 0–500'), (float('nan'), 'Outside 0–500')]:
            with self.subTest(value=value):
                self.assertEqual(category(value), expected)

    def test_export_calendar_alignment_and_raw_values(self):
        frame = pd.DataFrame({'Date': ['2020-02-28', '2020-12-31']})
        result = forecast_output(frame, [50.5, 501.23])
        self.assertEqual(result.forecast_date.tolist(), ['2020-02-29', '2021-01-01'])
        self.assertEqual(result.predicted_next_day_aqi.tolist(), [50.5, 501.23])
        self.assertEqual(result.outside_0_500.tolist(), [False, True])
        self.assertNotIn('forecast_date', frame)
        with self.assertRaises(ValueError):
            forecast_output(pd.DataFrame({'Date': [None]}), [1])

    def test_report_only_navigation(self):
        import shutil
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copy2(ROOT / 'app.py', root / 'app.py')
            shutil.copytree(ROOT / 'reports', root / 'reports')
            (root / 'models').mkdir()
            shutil.copy2(ROOT / 'models/model_metadata.json', root / 'models/model_metadata.json')
            app = AppTest.from_file(str(root / 'app.py'), default_timeout=20).run()
            self.assertFalse(app.exception)
            self.assertEqual(len(app.metric), 4)
            app.sidebar.radio[0].set_value('Forecast').run()
            self.assertFalse(app.exception)
            self.assertEqual(len(app.metric), 3)
            app.radio(key="input_source").set_value('Manual observations').run()
            self.assertFalse(app.exception)
            self.assertTrue(any('pipeline is missing' in item.value for item in app.warning))
            app.sidebar.radio[0].set_value('Model & evidence').run()
            self.assertFalse(app.exception)

    def test_cached_model_keeps_input_validation(self):
        metadata = ROOT / 'models/model_metadata.json'
        frame = pd.read_csv(ROOT / 'example_input.csv')
        features = json.loads(metadata.read_text())['features']
        model = Pipeline([('imputer', SimpleImputer()), ('regressor', DummyRegressor())])
        model.fit(frame[features], [123.45])
        with patch('src.predict.joblib.load', side_effect=AssertionError('Should use cached model')):
            self.assertAlmostEqual(predict_frame(frame, 'unused', metadata, model=model)[0], 123.45)
            for bad in [frame.assign(City='Mumbai'), frame.assign(CO=-1),
                        frame.assign(aqi_today=np.nan), frame.assign(CO=np.inf),
                        frame.drop(columns='PM2.5')]:
                with self.assertRaises(ValueError):
                    predict_frame(bad, 'unused', metadata, model=model)
            blank = frame.copy()
            for name in features:
                if name != 'aqi_today':
                    blank[name] = np.nan
            self.assertTrue(np.isfinite(predict_frame(blank, 'unused', metadata, model=model)).all())

    def test_manual_forecast_with_temporary_model(self):
        # Use a separate app directory; never overwrite experiment artifacts.
        import shutil
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ['app.py', 'example_input.csv']:
                shutil.copy2(ROOT / name, root / name)
            shutil.copytree(ROOT / 'reports', root / 'reports')
            shutil.copytree(ROOT / 'models', root / 'models')
            frame = pd.read_csv(ROOT / 'example_input.csv')
            features = json.loads((root / 'models/model_metadata.json').read_text())['features']
            model = Pipeline([('imputer', SimpleImputer()), ('regressor', DummyRegressor())])
            model.fit(frame[features], [184.25])
            joblib.dump(model, root / 'models/aqi_pipeline.joblib')
            app = AppTest.from_file(str(root / 'app.py'), default_timeout=20).run()
            app.sidebar.radio[0].set_value('Forecast').run()
            app.radio(key="input_source").set_value('Manual observations').run()
            self.assertFalse(app.exception)
            app.button[0].click().run()
            self.assertFalse(app.exception)
            self.assertTrue(any(item.value == '184.2' for item in app.metric))
            self.assertTrue(app.success)


if __name__ == '__main__':
    unittest.main()
