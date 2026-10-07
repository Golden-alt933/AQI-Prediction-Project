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

Use your own Git name and email for your commits. Commit authorship identifies the team member responsible for the change.
