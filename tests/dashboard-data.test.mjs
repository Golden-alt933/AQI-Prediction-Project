import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aqiBand,
  summarize,
  summarizePollutant,
  monthlySeries,
  categoryDistribution,
  toCSV,
} from "../src/web/lib/analytics.mjs";
import { predictAQI } from "../src/web/lib/model.mjs";

const data = new URL("../public/data/", import.meta.url);

test("manifest and city assets keep source gaps while exposing all 26 regions", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", data), "utf8"),
  );
  assert.equal(manifest.cities.length, 26);
  assert.equal(manifest.source.license, "CC0: Public Domain");
  assert.deepEqual(manifest.pollutants, [
    "PM2.5",
    "PM10",
    "NO2",
    "SO2",
    "CO",
    "O3",
  ]);
  for (const cityInfo of manifest.cities) {
    const asset = JSON.parse(
      await readFile(new URL(`cities/${cityInfo.id}.json`, data), "utf8"),
    );
    assert.equal(
      asset.rows.length,
      cityInfo.recordCount,
      `${cityInfo.name} record count`,
    );
    assert.deepEqual(
      asset.rows.map((row) => row.date),
      [...new Set(asset.rows.map((row) => row.date))].sort(),
      `${cityInfo.name} dates are unique and sorted`,
    );
    assert.equal(
      asset.rows.filter((row) => row.aqi !== null).length,
      cityInfo.aqiCount,
      `${cityInfo.name} AQI count`,
    );
  }
  const city = JSON.parse(
    await readFile(new URL("cities/delhi.json", data), "utf8"),
  );
  assert.equal(city.city, "Delhi");
  assert.equal(city.rows.length, 2009);
  assert.ok(city.rows.some((row) => row.aqi === null));
  assert.equal(typeof city.rows.find((row) => row.aqi !== null).aqi, "number");
  assert.ok(city.rows.filter((row) => row.aqi === null).length > 0);
  assert.ok(city.rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)));
});

test("AQI bands use inclusive limits and distinguish missing and above-scale values", () => {
  assert.equal(aqiBand(50).label, "Good");
  assert.equal(aqiBand(51).label, "Satisfactory");
  assert.equal(aqiBand(100).label, "Satisfactory");
  assert.equal(aqiBand(200).label, "Moderate");
  assert.equal(aqiBand(300).label, "Poor");
  assert.equal(aqiBand(400).label, "Very Poor");
  assert.equal(aqiBand(500).label, "Severe");
  assert.equal(aqiBand(501).label, "Above scale");
  assert.equal(aqiBand(null).label, "No data");
  assert.equal(aqiBand(-1).label, "No data");
});

test("year summaries use the full calendar denominator, including leap years", () => {
  const rows = [
    { date: "2020-01-01", aqi: 20 },
    { date: "2020-02-29", aqi: 220 },
    { date: "2020-03-01", aqi: null },
  ];
  assert.deepEqual(summarize(rows, 2020), {
    mean: 120,
    max: 220,
    min: 20,
    maxDate: "2020-02-29",
    minDate: "2020-01-01",
    validDays: 2,
    totalDays: 366,
    coverage: 2 / 366,
    unhealthyDays: 1,
  });
  assert.deepEqual(summarize([], 2019), {
    mean: null,
    max: null,
    min: null,
    maxDate: null,
    minDate: null,
    validDays: 0,
    totalDays: 365,
    coverage: 0,
    unhealthyDays: 0,
  });
});

test("pollutant summaries preserve measured zero and exclude missing or invalid values", () => {
  const rows = [
    { date: "2020-01-01", "PM2.5": null },
    { date: "2020-01-02", "PM2.5": 0 },
    { date: "2020-01-03", "PM2.5": 10 },
    { date: "2020-01-04", "PM2.5": "  " },
    { date: "2020-01-05", "PM2.5": -1 },
    { date: "2020-01-06", "PM2.5": Infinity },
  ];
  assert.deepEqual(summarizePollutant(rows, "PM2.5"), { mean: 5, count: 2 });
  assert.deepEqual(
    summarizePollutant(
      rows.filter((row) => row.date.startsWith("2020-02")),
      "PM2.5",
    ),
    { mean: null, count: 0 },
  );
  assert.deepEqual(
    summarizePollutant([{ "PM2.5": null }, { "PM2.5": "" }], "PM2.5"),
    { mean: null, count: 0 },
  );
});

test("pollutant summaries use only the selected annual subset", () => {
  const rows = [
    { date: "2020-12-31", NO2: 20 },
    { date: "2021-01-01", NO2: 100 },
    { date: "2021-01-02", NO2: null },
  ];
  const selectedYear = rows.filter((row) => row.date.startsWith("2021-"));
  assert.deepEqual(summarizePollutant(selectedYear, "NO2"), {
    mean: 100,
    count: 1,
  });
});

test("monthly and category charts preserve empty months and count observed values only", () => {
  const rows = [
    { date: "2022-01-01", aqi: 50 },
    { date: "2022-01-03", aqi: 101 },
    { date: "2022-12-31", aqi: null },
  ];
  const series = monthlySeries(rows, 2022);
  assert.equal(series.length, 12);
  assert.deepEqual(series[0], { month: "Jan", aqi: 75.5, validDays: 2 });
  assert.deepEqual(series[1], { month: "Feb", aqi: null, validDays: 0 });
  assert.equal(
    categoryDistribution(rows, 2022).reduce((sum, item) => sum + item.count, 0),
    2,
  );
});

test("CSV export escapes delimiters and includes all measurement fields", () => {
  assert.equal(
    toCSV([{ date: "2020-01-01", aqi: 10, "PM2.5": "1,2" }]),
    'date,aqi,PM2.5,PM10,NO2,SO2,CO,O3\r\n2020-01-01,10,"1,2",,,,,',
  );
});

test("browser forest matches sklearn predictions for every held-out row and null/extreme fixture", async () => {
  const model = JSON.parse(await readFile(new URL("model.json", data), "utf8"));
  const cases = JSON.parse(
    await readFile(new URL("parity-cases.json", data), "utf8"),
  );
  assert.equal(cases.length, 308);
  let maxError = 0;
  for (const item of cases)
    maxError = Math.max(
      maxError,
      Math.abs(predictAQI(model, item.readings) - item.expected),
    );
  assert.ok(maxError <= 1e-8, `max parity error ${maxError}`);
  assert.throws(() => predictAQI(model, { "PM2.5": 1 }), /aqi_today/);
  assert.throws(() => predictAQI(model, { aqi_today: -1 }), /aqi_today/);
  assert.throws(() => predictAQI(model, { aqi_today: Infinity }), /aqi_today/);
  assert.throws(
    () => predictAQI(model, { aqi_today: 10, "PM2.5": -1 }),
    /PM2.5/,
  );
  assert.throws(() => predictAQI(model, { aqi_today: 1e300 }), /finite range/);
  assert.throws(
    () => predictAQI(model, { aqi_today: 100, "PM2.5": 1e300 }),
    /finite range/,
  );
  assert.ok(
    Number.isFinite(predictAQI(model, { aqi_today: 100, "PM2.5": "   " })),
  );
});
