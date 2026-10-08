const BANDS = [
  {
    upper: 50,
    label: "Good",
    color: "#20a36a",
    description: "Minimal impact on health.",
  },
  {
    upper: 100,
    label: "Satisfactory",
    color: "#8dbb36",
    description: "Minor breathing discomfort to sensitive people.",
  },
  {
    upper: 200,
    label: "Moderate",
    color: "#e6b82e",
    description:
      "Breathing discomfort to people with lung, asthma or heart conditions.",
  },
  {
    upper: 300,
    label: "Poor",
    color: "#ed8735",
    description: "Breathing discomfort to most people on prolonged exposure.",
  },
  {
    upper: 400,
    label: "Very Poor",
    color: "#d94b45",
    description: "Respiratory illness on prolonged exposure.",
  },
  {
    upper: 500,
    label: "Severe",
    color: "#8d344d",
    description:
      "Affects healthy people and seriously impacts people with existing conditions.",
  },
];

export function aqiBand(value) {
  if (value == null || value === "") {
    return {
      label: "No data",
      color: "#8a929b",
      description: "No AQI observation is available for this date.",
    };
  }
  const aqi = Number(value);
  if (!Number.isFinite(aqi) || aqi < 0) {
    return {
      label: "No data",
      color: "#8a929b",
      description: "No AQI observation is available for this date.",
    };
  }
  return (
    BANDS.find((band) => aqi <= band.upper) ?? {
      label: "Above scale",
      color: "#63314f",
      description: "Observed AQI is above the standard 0–500 display scale.",
    }
  );
}

function validAQI(row) {
  const value = Number(row?.aqi);
  return (
    row?.aqi != null && row.aqi !== "" && Number.isFinite(value) && value >= 0
  );
}

function rowsForYear(rows, year) {
  return rows.filter(
    (row) => typeof row.date === "string" && row.date.startsWith(`${year}-`),
  );
}

export function summarize(rows, year) {
  const yearRows = rowsForYear(rows, year);
  const observations = yearRows
    .filter(validAQI)
    .map((row) => ({ row, value: Number(row.aqi) }));
  const values = observations.map(({ value }) => value);
  const totalDays = new Date(Number(year), 1, 29).getMonth() === 1 ? 366 : 365;
  const validDays = values.length;
  const max = validDays ? Math.max(...values) : null;
  const min = validDays ? Math.min(...values) : null;
  return {
    mean: validDays
      ? values.reduce((sum, value) => sum + value, 0) / validDays
      : null,
    max,
    min,
    maxDate: validDays
      ? observations.find(({ value }) => value === max).row.date
      : null,
    minDate: validDays
      ? observations.find(({ value }) => value === min).row.date
      : null,
    validDays,
    totalDays,
    /** Fraction of all calendar days with a valid observed AQI, from 0 to 1. */
    coverage: validDays / totalDays,
    unhealthyDays: values.filter((value) => value > 200).length,
  };
}

export function summarizePollutant(rows, field) {
  let mean = 0;
  let count = 0;
  for (const row of rows) {
    const raw = row?.[field];
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) continue;
    count += 1;
    mean += (value - mean) / count;
  }
  return { mean: count ? mean : null, count };
}

export function monthlySeries(rows, year) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: new Date(Date.UTC(2020, index, 1)).toLocaleString("en", {
      month: "short",
      timeZone: "UTC",
    }),
    values: [],
  }));
  for (const row of rowsForYear(rows, year)) {
    if (!validAQI(row)) continue;
    const monthIndex = Number(row.date.slice(5, 7)) - 1;
    if (monthIndex >= 0 && monthIndex < 12)
      months[monthIndex].values.push(Number(row.aqi));
  }
  return months.map(({ month, values }) => ({
    month,
    aqi: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    validDays: values.length,
  }));
}

export function categoryDistribution(rows, year) {
  const counts = new Map(
    BANDS.map((band) => [
      band.label,
      { label: band.label, color: band.color, count: 0 },
    ]),
  );
  counts.set("Above scale", {
    label: "Above scale",
    color: "#63314f",
    count: 0,
  });
  for (const row of rowsForYear(rows, year)) {
    if (!validAQI(row)) continue;
    const band = aqiBand(Number(row.aqi));
    counts.get(band.label).count += 1;
  }
  return [...counts.values()];
}

export function toCSV(rows) {
  const columns = ["date", "aqi", "PM2.5", "PM10", "NO2", "SO2", "CO", "O3"];
  const quote = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => quote(row[column])).join(",")),
  ].join("\r\n");
}
