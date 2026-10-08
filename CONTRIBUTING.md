# Team workflow

Keep `main` runnable. Create a short feature branch for each task and open a pull request with a description of the behavior changed and the checks run. Prefer focused commits with plain descriptions.

Before proposing changes:

```powershell
./.venv/Scripts/python.exe -m unittest discover -s tests -v
./.venv/Scripts/python.exe -m compileall -q src tests
git diff --check
```

For changes that affect forecasting, run the training and saved-model verification commands in README.md. Explain how the change affects forecast alignment, preprocessing and evaluation. Do not select new features or parameters using the final test period; establish a new independent holdout when redesigning after seeing its results.

Keep raw datasets, virtual environments, credentials, local paths and fitted model binaries out of commits. Download the dataset independently from its publisher and verify its license before redistribution. Include concise measured results and relevant figures for model changes.

## Dashboard changes

The browser dashboard lives in `src/web/`. Run `npm ci`, `npm test`, `npm run build`, and `npm run test:e2e` for changes that affect its behavior. Install the test browser with `npx playwright install chromium` on a new machine. Keep chart labels, historical coverage, and model scope consistent with the source data; missing observations must remain missing.

The attributed, derived JSON in `public/data/` is intentionally versioned so a fresh checkout can run the dashboard without the original raw CSV or Python binary. The fitted forest is exported as JSON for browser inference. Regenerate this bundle with `python scripts/export_dashboard.py` after reproducing the Python experiment; the exporter checks the training data fingerprint and requires browser predictions to match the saved pipeline. Commit all related data/model exports together. Do not hand-edit model outputs or use the final test period to tune the model.

Fonts in `public/fonts/` are self-hosted under their included SIL Open Font License files. Preserve those licenses when changing font assets. Screenshots in `docs/screenshots/` should come from the actual running dashboard.

Use your own Git name and email for your commits. Commit authorship identifies the team member responsible for the change.
