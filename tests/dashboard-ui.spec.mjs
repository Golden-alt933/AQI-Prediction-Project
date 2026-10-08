import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openAtlas(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See the air clearly." }),
  ).toBeVisible();
  await expect(page.getByLabel("LOCATION")).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator(".aqi-date")).toContainText("Delhi");
  await expect(page.locator(".aqi-value")).not.toHaveText("—", {
    timeout: 20_000,
  });
}

test("loads authentic history for all 26 cities and switches between day and year views", async ({
  page,
}) => {
  const manifestResponse = await page.request.get("/data/manifest.json");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.cities).toHaveLength(26);

  await openAtlas(page);
  await page.getByLabel("LOCATION").selectOption("mumbai");
  await expect(page.locator(".aqi-date")).toContainText("Mumbai");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await page.getByLabel("Select year").selectOption("2019");
  await expect(
    page.getByRole("heading", { name: "Air quality through 2019" }),
  ).toBeVisible();
  await expect(page.locator(".aqi-unit")).toContainText("mean AQI");
  await expect(
    page.getByRole("button", { name: "Year", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByLabel("Select date")).toHaveValue(/^2019-/);
});

test("a bookmarked year survives reload, and invalid URL filters recover to valid data", async ({
  page,
}) => {
  await page.goto("/?city=mumbai&view=year&year=2019");
  await expect(
    page.getByRole("heading", { name: "Air quality through 2019" }),
  ).toBeVisible();
  await expect(page.getByLabel("LOCATION")).toHaveValue("mumbai");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Air quality through 2019" }),
  ).toBeVisible();
  await expect(page.getByLabel("Select year")).toHaveValue("2019");

  await page.goto("/?city=not-a-city&view=invalid&date=not-a-date&year=1900");
  await expect(page.getByLabel("LOCATION")).toHaveValue("delhi");
  await expect(page.getByLabel("Select date")).toHaveValue("2020-07-01");
  await expect(page).toHaveURL(/city=delhi&view=date&date=2020-07-01/);
});

test("keeps an observed row with missing AQI visibly unavailable", async ({
  page,
}) => {
  await openAtlas(page);
  await page.getByLabel("Select date").fill("2016-07-24");
  await expect(page.locator(".aqi-date")).toContainText("24 Jul 2016");
  await expect(page.locator(".aqi-value")).toHaveText("—");
  await expect(page.locator(".aqi-card .scale-marker")).toHaveCount(0);
  await expect(
    page.getByText("No AQI reading recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".pollutant-info").filter({ hasText: "PM2.5" }),
  ).toContainText("59.4");
  await page.getByLabel("Select date").fill("2015-03-04");
  await expect(page.locator(".aqi-value")).toHaveText("200");
  await expect(page.locator(".quality-chip")).toContainText("Moderate");
  await expect(page.locator(".aqi-card .scale-marker")).toHaveAttribute(
    "style",
    /left:\s*40%/,
  );

  await page.getByLabel("Select date").fill("2017-08-12");
  await expect(
    page
      .locator(".pollutant-info")
      .filter({ hasText: "PM2.5" })
      .locator("strong"),
  ).toHaveText("—");
  const history = await (
    await page.request.get("/data/cities/delhi.json")
  ).json();
  const observedPm25 = history.rows
    .filter((row) => row.date.startsWith("2019-") && row["PM2.5"] != null)
    .map((row) => row["PM2.5"]);
  const expectedPm25Mean = (
    observedPm25.reduce((sum, value) => sum + value, 0) / observedPm25.length
  ).toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await page.getByLabel("Select year").selectOption("2019");
  await expect(
    page
      .locator(".pollutant-info")
      .filter({ hasText: "PM2.5" })
      .locator("strong"),
  ).toHaveText(expectedPm25Mean);
});

test("runs a one-day Delhi forecast and exposes source pollutant gaps", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Forecast lab", exact: true }).click();
  await page.getByLabel("Scenario measurement date").fill("2020-06-30");
  await page.getByLabel("Today's AQI").fill("114");
  await expect(
    page.getByText("Blank pollutant fields use the training median."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Predict next day" }).click();
  await expect(page.getByText("PREDICTED FOR · 1 Jul 2020")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".result-value")).not.toHaveText("—", {
    timeout: 20_000,
  });
  await expect(
    page.getByText("Offline model scenario · not a live advisory"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Prefill from archive" }).click();
  await expect(page.getByLabel("Scenario measurement date")).toHaveValue(
    "2020-06-30",
  );
  await expect(page.getByLabel("Today's AQI")).toHaveValue("114");
  await page.getByRole("button", { name: "Predict next day" }).click();
  await expect(page.locator(".result-value")).toHaveText("118.7", {
    timeout: 20_000,
  });
  await expect(page.locator(".forecast-result")).toContainText("101 AQI");

  await page.getByLabel("Scenario measurement date").fill("2017-08-12");
  await page.getByRole("button", { name: "Prefill from archive" }).click();
  await expect(page.getByLabel("Scenario measurement date")).toHaveValue(
    "2017-08-12",
  );
  await expect(page.getByLabel("Today's AQI")).toHaveValue("45");
  await expect(page.getByLabel("PM2.5 input")).toHaveValue("");
  await expect(
    page.locator(".numeric-field").filter({ hasText: "PM2.5" }),
  ).toContainText("Optional · blank = median");
});

test("shows held-out metrics, time splits, and forecast comparison in the model report", async ({
  page,
}) => {
  await openAtlas(page);
  await page.getByRole("button", { name: "Model report" }).click();
  await expect(
    page.getByRole("heading", { name: "Model report." }),
  ).toBeVisible();
  await expect(page.getByText("27.14", { exact: true })).toBeVisible();
  await expect(page.getByText("34.50", { exact: true })).toBeVisible();
  await expect(page.locator(".report-hero")).toContainText(
    "2019-09-07 — 2020-07-01",
  );
  await expect(page.locator(".split-stage.stage-test")).toContainText(
    "2019-09-06",
  );
  await expect(page.locator(".split-stage.stage-test")).toContainText(
    "2020-07-01",
  );
  await expect(
    page.getByRole("heading", { name: "Recorded, predicted & baseline AQI" }),
  ).toBeVisible();
  await expect(page.locator(".report-chart-grid")).toContainText("299 DAYS");
  await expect(page.locator(".report-chart-grid")).toContainText("Observed");
  await expect(page.locator(".report-chart-grid")).toContainText("Persistence");
  const timelineCurves = page.locator(
    ".report-chart-grid .recharts-line-curve",
  );
  await expect(timelineCurves).toHaveCount(3);
  for (const curve of await timelineCurves.all()) {
    await expect(curve).toHaveAttribute("d", /M.{100,}/);
  }
});

test("exports the selected historical year as a usable CSV", async ({
  page,
}) => {
  await openAtlas(page);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await page.getByLabel("Select year").selectOption("2019");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("vayu-delhi-2019.csv");
  const contents = await readFile(await download.path(), "utf8");
  expect(contents.split(/\r?\n/).length).toBeGreaterThan(300);
  expect(contents.split(/\r?\n/)[0]).toContain("date,aqi");
});

test("mobile navigation remains usable without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAtlas(page);
  const pageWidth = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .map((element) => ({
        tag: element.tagName,
        className:
          typeof element.className === "string" ? element.className : "",
        right: Math.round(element.getBoundingClientRect().right * 100) / 100,
        width: Math.round(element.getBoundingClientRect().width * 100) / 100,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }))
      .filter((element) => element.right > window.innerWidth + 0.5)
      .sort((a, b) => b.right - a.right)
      .slice(0, 8),
  }));
  if (pageWidth.scroll > pageWidth.inner)
    console.log("Mobile horizontal overflow:", JSON.stringify(pageWidth));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.inner);
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("navigation");
  await expect(
    nav.getByRole("button", { name: "About this atlas" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "About this atlas" }).click();
  await expect(
    page.getByRole("heading", { name: "About Vayu." }),
  ).toBeVisible();
});

test("shows a useful message when the local model asset cannot load", async ({
  page,
}) => {
  await page.route("**/data/model.json", (route) =>
    route.fulfill({ status: 503, body: "offline" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Forecast lab", exact: true }).click();
  await page.getByLabel("Scenario measurement date").fill("2020-06-30");
  await page.getByLabel("Today's AQI").fill("114");
  await page.getByRole("button", { name: "Predict next day" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "trained model file could not be loaded",
  );
});

test("a slow previous city response cannot replace the latest city selection", async ({
  page,
}) => {
  await openAtlas(page);
  let beganMumbaiResponse;
  let releaseMumbaiResponse;
  let finishedMumbaiResponse;
  const mumbaiResponseStarted = new Promise((resolve) => {
    beganMumbaiResponse = resolve;
  });
  const mumbaiResponseFinished = new Promise((resolve) => {
    finishedMumbaiResponse = resolve;
  });
  const holdMumbaiResponse = new Promise((resolve) => {
    releaseMumbaiResponse = resolve;
  });
  await page.route("**/data/cities/mumbai.json", async (route) => {
    beganMumbaiResponse();
    await holdMumbaiResponse;
    const response = await route.fetch();
    await route.fulfill({ response });
    finishedMumbaiResponse();
  });
  await page.getByLabel("LOCATION").selectOption("mumbai");
  await mumbaiResponseStarted;
  await page.getByLabel("LOCATION").selectOption("delhi");
  await expect(page.locator(".aqi-date")).toContainText("Delhi");
  await page.getByLabel("Select date").fill("2020-07-01");
  await expect(page.locator(".aqi-value")).toHaveText("101");
  releaseMumbaiResponse();
  await mumbaiResponseFinished;
  await expect(page.locator(".aqi-value")).toHaveText("101");
});
