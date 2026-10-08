import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileChartColumnIncreasing,
  FlaskConical,
  Gauge,
  Info,
  Leaf,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Wind,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  aqiBand,
  categoryDistribution,
  monthlySeries,
  summarize,
  summarizePollutant,
  toCSV,
} from "./lib/analytics.mjs";
import { predictAQI } from "./lib/model.mjs";

const navItems = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "forecast", label: "Forecast lab", icon: FlaskConical },
  { id: "report", label: "Model report", icon: FileChartColumnIncreasing },
  { id: "about", label: "About this atlas", icon: CircleHelp },
];
const POLLUTANTS = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"];
const fmt = (value, digits = 0) =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const isISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};
const dateLabel = (
  value,
  options = { day: "numeric", month: "short", year: "numeric" },
) =>
  isISODate(value)
    ? new Intl.DateTimeFormat("en-IN", options).format(
        new Date(`${value}T12:00:00`),
      )
    : "—";
const dateForInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const readParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    city: params.get("city") || "",
    view: params.get("view") === "year" ? "year" : "date",
    date: params.get("date") || "",
    year: params.get("year") || "",
  };
};
const useUrlState = (city, view, date, year) =>
  useEffect(() => {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    params.set("view", view);
    params.set(
      view === "year" ? "year" : "date",
      view === "year" ? year : date,
    );
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [city, view, date, year]);

function App() {
  const initial = useMemo(readParams, []);
  const [page, setPage] = useState("overview");
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState("");
  const [cityId, setCityId] = useState(initial.city);
  const [view, setView] = useState(initial.view);
  const [date, setDate] = useState(initial.date);
  const [year, setYear] = useState(initial.year);
  const [rows, setRows] = useState([]);
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [forecastInputs, setForecastInputs] = useState({
    date: "",
    ...Object.fromEntries(POLLUTANTS.map((p) => [p, ""])),
  });
  const [forecastResult, setForecastResult] = useState(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastBusy, setForecastBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Data catalogue is not available yet.");
        return r.json();
      })
      .then((m) => {
        setManifest(m);
        setManifestError("");
      })
      .catch((e) => setManifestError(e.message));
  }, []);

  const cities = manifest?.cities || [];
  const selectedCity =
    cities.find((c) => c.id === cityId) ||
    cities.find((c) => c.name === "Delhi") ||
    cities[0];
  useEffect(() => {
    if (!selectedCity) return;
    if (selectedCity.id !== cityId) setCityId(selectedCity.id);
    setCityBusy(true);
    setCityError("");
    const controller = new AbortController();
    fetch(`/data/cities/${encodeURIComponent(selectedCity.id)}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok)
          throw new Error(`Could not load ${selectedCity.name} history.`);
        return r.json();
      })
      .then((data) =>
        setRows(
          (data.rows || [])
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date)),
        ),
      )
      .catch((e) => {
        if (e.name !== "AbortError") {
          setRows([]);
          setCityError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCityBusy(false);
      });
    return () => controller.abort();
  }, [selectedCity?.id]);

  useUrlState(selectedCity?.id || cityId, view, date, year);
  const cityYears = useMemo(
    () =>
      (
        selectedCity?.years ||
        [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort()
      ).map(String),
    [selectedCity, rows],
  );
  useEffect(() => {
    if (!rows.length) return;
    if (!isISODate(date)) setDate(rows.at(-1).date);
    if (!year || !cityYears.includes(String(year)))
      setYear(String(cityYears.at(-1) || rows.at(-1).date.slice(0, 4)));
  }, [rows, cityYears]);
  const selectedYear =
    view === "year"
      ? String(year)
      : isISODate(date)
        ? date.slice(0, 4)
        : String(year);
  const yearRows = useMemo(
    () => rows.filter((r) => r.date.startsWith(String(selectedYear))),
    [rows, selectedYear],
  );
  const dayRow = useMemo(() => rows.find((r) => r.date === date), [rows, date]);
  const yearSummary = useMemo(
    () => summarize(rows, selectedYear),
    [rows, selectedYear],
  );
  const distribution = useMemo(
    () => categoryDistribution(rows, selectedYear),
    [rows, selectedYear],
  );
  const months = useMemo(
    () => monthlySeries(rows, selectedYear),
    [rows, selectedYear],
  );
  const band = aqiBand(view === "year" ? yearSummary.mean : dayRow?.aqi);
  const periodRows = view === "year" ? yearRows : dayRow ? [dayRow] : [];
  const chartRows =
    view === "year"
      ? yearRows
      : rows.filter(
          (r) =>
            r.date >= offsetDate(date, -14) && r.date <= offsetDate(date, 14),
        );
  const chartBandColor = band?.color || "#64716c";
  const displayAqi = view === "year" ? yearSummary.mean : dayRow?.aqi;
  const heroTitle =
    view === "year"
      ? `${selectedYear} annual average`
      : dayRow
        ? dateLabel(dayRow.date)
        : "No reading for this date";

  const handleExport = () => {
    if (!periodRows.length) return;
    const csv = toCSV(periodRows);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vayu-${selectedCity?.id || "india"}-${view === "year" ? year : date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const selectCity = (id) => {
    setCityId(id);
    setRows([]);
    setDate("");
    setYear("");
  };
  const loadReport = useCallback(() => {
    setReportError("");
    fetch("/data/model-report.json")
      .then((r) => {
        if (!r.ok) throw new Error("Model report is not available.");
        return r.json();
      })
      .then(setReport)
      .catch((e) => setReportError(e.message));
  }, []);
  useEffect(() => {
    if (page === "report" && !report && !reportError) loadReport();
  }, [page, report, reportError, loadReport]);

  const runForecast = async (event) => {
    event.preventDefault();
    setForecastError("");
    setForecastResult(null);
    if (!forecastInputs.date || forecastInputs.aqi_today === "") {
      setForecastError("Enter a measurement date and today’s AQI.");
      return;
    }
    setForecastBusy(true);
    try {
      const values = { aqi_today: Number(forecastInputs.aqi_today) };
      for (const pollutant of POLLUTANTS)
        values[pollutant] =
          forecastInputs[pollutant] === ""
            ? null
            : Number(forecastInputs[pollutant]);
      const [modelResponse] = await Promise.all([
        fetch("/data/model.json").then((r) => {
          if (!r.ok)
            throw new Error("The trained model file could not be loaded.");
          return r.json();
        }),
      ]);
      const predicted = predictAQI(modelResponse, values);
      if (!Number.isFinite(Number(predicted)))
        throw new Error("The model returned an invalid AQI value.");
      setForecastResult({
        predicted: Number(predicted),
        inputDate: forecastInputs.date,
        targetDate: offsetDate(forecastInputs.date, 1),
        source: { aqi: values.aqi_today },
        values,
      });
    } catch (e) {
      setForecastError(e.message || "Forecast failed. Please retry.");
    } finally {
      setForecastBusy(false);
    }
  };
  const prepareForecastFromDay = () => {
    const d = selectedCity?.name === "Delhi" ? dayRow : null;
    if (!d) return;
    setForecastInputs((current) => ({
      ...current,
      date: d.date,
      aqi_today: d.aqi == null ? "" : String(d.aqi),
      ...Object.fromEntries(
        POLLUTANTS.map((p) => [p, d[p] == null ? "" : String(d[p])]),
      ),
    }));
    setPage("forecast");
  };

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
          aria-label="Vayu home"
        >
          <span className="brand-mark">
            <Wind size={22} strokeWidth={2.2} />
          </span>
          <span>
            <strong>vayu</strong>
            <small>INDIA AIR ATLAS</small>
          </span>
        </a>
        <div className="side-caption">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${page === id ? "active" : ""}`}
              onClick={() => {
                setPage(id);
                setMobileMenu(false);
              }}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "overview" && page === id && <i />}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="archive-card">
            <span className="archive-icon">
              <Clock3 size={16} />
            </span>
            <div>
              <b>Historical archive</b>
              <span>2015 — 2020</span>
            </div>
            <span className="archive-dot" />
          </div>
          <div className="side-credit">
            <span className="online-dot" /> DATASET READY{" "}
            <small>Academic research edition</small>
          </div>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>India</span>
            <ChevronRight size={14} />
            <strong>
              {page === "overview"
                ? "Air quality overview"
                : navItems.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="archive-pill">
              <span /> HISTORICAL ARCHIVE&nbsp; · &nbsp;2015–2020
            </span>
            <button
              className="export-button"
              onClick={handleExport}
              disabled={!periodRows.length}
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {page === "overview" && (
            <>
              <section className="page-intro">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> AIR QUALITY ATLAS{" "}
                    <span className="eyebrow-chip">HISTORICAL DATA</span>
                  </div>
                  <h1>
                    See the air <em>clearly.</em>
                  </h1>
                  <p>
                    Explore daily air quality across India. Choose a place and
                    time to uncover the story in the data.
                  </p>
                </div>
                <div className="intro-stamp">
                  <Leaf size={17} />
                  <span>
                    MADE FOR
                    <br />
                    BETTER AIR
                  </span>
                </div>
              </section>
              <section
                className="filter-panel"
                aria-label="Historical data filters"
              >
                <div className="filter-location">
                  <div className="filter-icon">
                    <MapPin size={17} />
                  </div>
                  <label htmlFor="city-select">LOCATION</label>
                  <div className="select-wrap">
                    <select
                      id="city-select"
                      value={selectedCity?.id || ""}
                      onChange={(e) => selectCity(e.target.value)}
                      disabled={!cities.length}
                    >
                      <option value="" disabled>
                        Choose a city
                      </option>
                      {cities.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}, {c.state}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <small>{selectedCity?.state || "Indian city"}</small>
                </div>
                <div className="filter-divider" />
                <div className="filter-period">
                  <div className="period-head">
                    <span className="filter-icon">
                      <CalendarDays size={17} />
                    </span>
                    <span>TIME PERIOD</span>
                    <div
                      className="view-toggle"
                      role="group"
                      aria-label="Time period view"
                    >
                      <button
                        onClick={() => {
                          if (view === "year" && !date.startsWith(`${year}-`))
                            setDate(
                              rows.find((r) => r.date.startsWith(`${year}-`))
                                ?.date || `${year}-01-01`,
                            );
                          setView("date");
                        }}
                        className={view === "date" ? "selected" : ""}
                        aria-pressed={view === "date"}
                      >
                        Day
                      </button>
                      <button
                        onClick={() => {
                          if (isISODate(date)) setYear(date.slice(0, 4));
                          setView("year");
                        }}
                        className={view === "year" ? "selected" : ""}
                        aria-pressed={view === "year"}
                      >
                        Year
                      </button>
                    </div>
                  </div>
                  <div className="period-control">
                    {view === "date" ? (
                      <>
                        <input
                          aria-label="Select date"
                          type="date"
                          min={selectedCity?.startDate}
                          max={selectedCity?.endDate}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                        <span className="period-hint">
                          Pick any available day
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          className="year-arrow"
                          aria-label="Previous year"
                          onClick={() =>
                            setYear(
                              String(
                                Math.max(
                                  Number(cityYears[0] || 2015),
                                  Number(year || cityYears.at(-1)) - 1,
                                ),
                              ),
                            )
                          }
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <select
                          aria-label="Select year"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                        >
                          {cityYears.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                        <button
                          className="year-arrow"
                          aria-label="Next year"
                          onClick={() =>
                            setYear(
                              String(
                                Math.min(
                                  Number(cityYears.at(-1) || 2020),
                                  Number(year || cityYears[0]) + 1,
                                ),
                              ),
                            )
                          }
                        >
                          <ChevronRight size={17} />
                        </button>
                        <span className="period-hint">Annual view</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="filter-summary">
                  <span className="summary-dot" />
                  {view === "year"
                    ? `${year} · ${selectedCity?.name || "India"}`
                    : date
                      ? dateLabel(date)
                      : "Choose a date"}
                  <small>Historical snapshot</small>
                </div>
              </section>
              {manifestError && !manifest ? (
                <Notice
                  icon={<RefreshCw size={18} />}
                  title="Preparing the air quality atlas"
                  body={manifestError}
                />
              ) : cityError ? (
                <Notice
                  icon={<Info size={18} />}
                  title="City data could not load"
                  body={cityError}
                />
              ) : cityBusy && !rows.length ? (
                <LoadingNotice />
              ) : !rows.length ? (
                <Notice
                  icon={<Search size={18} />}
                  title="No matching records"
                  body="The selected location has no data in the project archive."
                />
              ) : (
                <>
                  <section className="overview-grid">
                    <article
                      className="aqi-card"
                      style={{ "--band-color": chartBandColor }}
                    >
                      <div className="aqi-card-top">
                        <div>
                          <span className="card-kicker">
                            {view === "year"
                              ? "ANNUAL AIR QUALITY"
                              : "DAILY AIR QUALITY"}
                          </span>
                          <div className="aqi-date">
                            <span className="city-marker">
                              <MapPin size={14} />
                            </span>
                            {selectedCity?.name}, India{" "}
                            <span className="date-separator">/</span>{" "}
                            {heroTitle}
                          </div>
                        </div>
                        <div className="quality-chip">
                          <span />
                          {band?.label || "No data"}
                        </div>
                      </div>
                      <div className="aqi-main">
                        <div className="aqi-value">
                          {displayAqi == null
                            ? "—"
                            : fmt(displayAqi, view === "year" ? 1 : 0)}
                        </div>
                        <div className="aqi-unit">
                          {view === "year" ? "mean AQI" : "AQI"}
                          <span>
                            {view === "year"
                              ? `of ${yearSummary.validDays} available readings`
                              : "India AQI scale"}
                          </span>
                        </div>
                        <div className="aqi-note">
                          {view === "year" &&
                          (yearRows.at(-1)?.date < `${selectedYear}-12-31` ||
                            yearRows[0]?.date > `${selectedYear}-01-01`)
                            ? `Partial year · data through ${dateLabel(yearRows.at(-1)?.date)}`
                            : band?.description ||
                              "No AQI reading is recorded for this selection."}
                        </div>
                      </div>
                      <AQIScale value={displayAqi} />
                      <div className="aqi-footer">
                        <span>
                          <span className="footer-pulse" />
                          {view === "year"
                            ? `${yearSummary.validDays} measured days`
                            : dayRow?.aqi != null
                              ? "Measured daily AQI"
                              : dayRow
                                ? "No AQI reading recorded"
                                : "No measurement"}
                        </span>
                        <button
                          onClick={prepareForecastFromDay}
                          disabled={selectedCity?.name !== "Delhi" || !dayRow}
                          title={
                            selectedCity?.name !== "Delhi"
                              ? "Forecast model is trained for Delhi only"
                              : ""
                          }
                        >
                          Open forecast lab <ChevronRight size={15} />
                        </button>
                      </div>
                    </article>
                    <article className="coverage-card">
                      <div className="section-card-header">
                        <div>
                          <div className="card-kicker">AT A GLANCE</div>
                          <h2>Coverage &amp; context</h2>
                        </div>
                        <span className="subtle-icon">
                          <Activity size={17} />
                        </span>
                      </div>
                      <div className="stat-list">
                        <StatRow
                          icon={<CalendarDays size={16} />}
                          label="Measured days"
                          value={fmt(yearSummary.validDays)}
                          context={`of ${fmt(yearSummary.totalDays)} calendar days`}
                        />
                        <StatRow
                          icon={<ShieldCheck size={16} />}
                          label="Data coverage"
                          value={`${fmt((yearSummary.coverage || 0) * 100, 1)}%`}
                          context={`in ${selectedYear}`}
                        />
                        <StatRow
                          icon={<ArrowUpRight size={16} />}
                          label="Highest AQI"
                          value={fmt(yearSummary.max)}
                          context={
                            yearSummary.maxDate
                              ? dateLabel(yearSummary.maxDate)
                              : "no readings"
                          }
                          tone="orange"
                        />
                        <StatRow
                          icon={<Activity size={16} />}
                          label="Days above 200"
                          value={fmt(yearSummary.unhealthyDays)}
                          context="AQI observations"
                          tone="red"
                        />
                      </div>
                      <div className="coverage-foot">
                        <Info size={14} />
                        <span>
                          Daily city observations can be incomplete. Coverage
                          helps put averages in context.
                        </span>
                      </div>
                    </article>
                  </section>
                  <section className="chart-grid">
                    <article className="chart-card trend-card">
                      <div className="section-card-header chart-heading">
                        <div>
                          <div className="card-kicker">
                            {view === "year" ? "YEAR IN REVIEW" : "DAILY TREND"}
                          </div>
                          <h2>
                            {view === "year"
                              ? `Air quality through ${selectedYear}`
                              : "Around your selected day"}
                          </h2>
                          <p>
                            {view === "year"
                              ? "Recorded AQI readings by day"
                              : "Two weeks before and after the selected date"}
                          </p>
                        </div>
                        <span className="chart-period-tag">
                          <span />
                          AQI · daily
                        </span>
                      </div>
                      <div className="chart-plot trend-plot">
                        {chartRows.filter((r) => r.aqi != null).length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={chartRows}
                              margin={{
                                top: 12,
                                right: 10,
                                left: -22,
                                bottom: 0,
                              }}
                            >
                              <defs>
                                <linearGradient
                                  id="aqiFill"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#4a9d82"
                                    stopOpacity={0.24}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor="#4a9d82"
                                    stopOpacity={0.015}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                stroke="#e9ece7"
                                strokeDasharray="3 5"
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(v) =>
                                  dateLabel(v, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                }
                                tick={{ fill: "#84918b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={38}
                              />
                              <YAxis
                                tick={{ fill: "#84918b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <ReferenceLine
                                y={200}
                                stroke="#e8a35b"
                                strokeDasharray="4 4"
                                label={{
                                  value: "AQI 200",
                                  fill: "#b4763a",
                                  fontSize: 10,
                                  position: "insideTopRight",
                                }}
                              />
                              <Area
                                isAnimationActive={false}
                                type="monotone"
                                dataKey="aqi"
                                name="AQI"
                                stroke="#31846e"
                                strokeWidth={2.5}
                                fill="url(#aqiFill)"
                                connectNulls={false}
                                activeDot={{
                                  r: 4,
                                  fill: "#246e5a",
                                  stroke: "#fff",
                                  strokeWidth: 2,
                                }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <EmptyChart message="There are no AQI readings in this period." />
                        )}
                      </div>
                      <div className="chart-foot">
                        <span>
                          <i className="legend-line" /> AQI reading
                        </span>
                        <span className="chart-foot-note">
                          Missing readings are left blank
                        </span>
                      </div>
                    </article>
                    <article className="chart-card season-card">
                      <div className="section-card-header chart-heading">
                        <div>
                          <div className="card-kicker">SEASONAL PATTERN</div>
                          <h2>Month by month</h2>
                          <p>Monthly mean AQI in {selectedYear}</p>
                        </div>
                        <span className="chart-icon">
                          <Activity size={16} />
                        </span>
                      </div>
                      <div className="chart-plot seasonal-plot">
                        {months.some((m) => m.aqi != null) ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={months}
                              margin={{
                                top: 20,
                                right: 5,
                                left: -24,
                                bottom: 0,
                              }}
                            >
                              <CartesianGrid
                                vertical={false}
                                stroke="#e9ece7"
                                strokeDasharray="3 5"
                              />
                              <XAxis
                                dataKey="month"
                                tick={{ fill: "#84918b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                tick={{ fill: "#84918b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip content={<MonthTooltip />} />
                              <Bar
                                isAnimationActive={false}
                                dataKey="aqi"
                                name="Mean AQI"
                                radius={[5, 5, 0, 0]}
                                maxBarSize={26}
                              >
                                {months.map((m, i) => (
                                  <Cell
                                    key={i}
                                    fill={seasonColor(m.aqi)}
                                    opacity={m.aqi == null ? 0.22 : 1}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <EmptyChart message="No monthly measurements for this year." />
                        )}
                      </div>
                      <div className="month-summary">
                        <span>
                          <i
                            className="mini-swatch"
                            style={{ background: "#64ae8e" }}
                          />
                          Lower
                        </span>
                        <span>
                          <i
                            className="mini-swatch"
                            style={{ background: "#e1a05a" }}
                          />
                          Elevated
                        </span>
                        <span>
                          <i
                            className="mini-swatch"
                            style={{ background: "#cf6d56" }}
                          />
                          High
                        </span>
                      </div>
                    </article>
                  </section>
                  <section className="detail-grid">
                    <article className="chart-card pollutants-card">
                      <div className="section-card-header">
                        <div>
                          <div className="card-kicker">POLLUTANT READINGS</div>
                          <h2>
                            {view === "year"
                              ? "Annual mean concentrations"
                              : "What was in the air?"}
                          </h2>
                          <p>
                            {view === "year"
                              ? `Mean of available readings · ${selectedYear}`
                              : dayRow
                                ? dateLabel(date)
                                : "No measurement available for this day"}
                          </p>
                        </div>
                        <span className="chart-icon">
                          <Wind size={16} />
                        </span>
                      </div>
                      <div className="pollutant-grid">
                        {POLLUTANTS.map((p, i) => {
                          const source =
                            view === "year" ? yearRows : dayRow ? [dayRow] : [];
                          const { mean: avg, count } = summarizePollutant(
                            source,
                            p,
                          );
                          return (
                            <div className="pollutant-item" key={p}>
                              <div className={`pollutant-symbol p${i}`}>
                                <span>
                                  {p === "PM2.5"
                                    ? "PM₂"
                                    : p === "PM10"
                                      ? "PM₁₀"
                                      : p}
                                </span>
                              </div>
                              <div className="pollutant-info">
                                <span>{p}</span>
                                <strong>
                                  {avg == null ? "—" : fmt(avg, 1)}
                                </strong>
                                <small>
                                  {count
                                    ? `${count} measured ${count === 1 ? "reading" : "readings"}`
                                    : "No measurement"}
                                </small>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="unit-note">
                        <Info size={14} />
                        <span>
                          Units are retained from the source dataset and have
                          not been independently verified.
                        </span>
                      </div>
                    </article>
                    <article className="chart-card distribution-card">
                      <div className="section-card-header">
                        <div>
                          <div className="card-kicker">DISTRIBUTION</div>
                          <h2>Days by AQI band</h2>
                          <p>Daily category counts in {selectedYear}</p>
                        </div>
                        <span className="chart-icon">
                          <FileChartColumnIncreasing size={16} />
                        </span>
                      </div>
                      <div className="distribution-wrap">
                        {distribution.some((d) => d.count > 0) ? (
                          <div className="distribution-bars">
                            {distribution.map((item) => (
                              <div className="dist-row" key={item.label}>
                                <span className="dist-label">
                                  <i style={{ background: item.color }} />
                                  {item.label}
                                </span>
                                <div className="dist-track">
                                  <span
                                    style={{
                                      width: `${item.count && yearSummary.validDays ? (item.count / yearSummary.validDays) * 100 : 0}%`,
                                      background: item.color,
                                    }}
                                  />
                                </div>
                                <strong>{fmt(item.count)}</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyChart message="No categorized AQI readings for this year." />
                        )}
                      </div>
                      <div className="distribution-foot">
                        <span>
                          {fmt(yearSummary.validDays)} classified readings
                        </span>
                        <span>Scale retained as reported</span>
                      </div>
                    </article>
                  </section>
                  <section className="source-strip">
                    <div className="source-emblem">
                      <Leaf size={16} />
                    </div>
                    <div>
                      <strong>
                        A clearer picture starts with honest data.
                      </strong>
                      <span>
                        Historical city-level observations, with coverage and
                        model limits kept in view.
                      </span>
                    </div>
                    <button onClick={() => setPage("about")}>
                      How to read this atlas <ChevronRight size={15} />
                    </button>
                  </section>
                </>
              )}
            </>
          )}
          {page === "forecast" && (
            <ForecastPage
              cities={cities}
              rows={rows}
              selectedCity={selectedCity}
              inputs={forecastInputs}
              setInputs={setForecastInputs}
              result={forecastResult}
              error={forecastError}
              busy={forecastBusy}
              onSubmit={runForecast}
              onNavigate={setPage}
            />
          )}
          {page === "report" && (
            <ReportPage
              report={report}
              error={reportError}
              onRetry={loadReport}
            />
          )}
          {page === "about" && (
            <AboutPage
              source={manifest?.source}
              pollutants={manifest?.pollutants || POLLUTANTS}
              onNavigate={setPage}
            />
          )}
          <footer className="page-footer">
            <span>VAYU / INDIA AIR QUALITY ATLAS</span>
            <span>Historical data · 2015—2020</span>
            <span>Academic research project</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function offsetDate(value, amount) {
  if (!isISODate(value)) return "";
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dateForInput(d);
}
function seasonColor(v) {
  if (v == null) return "#d8ded9";
  if (v <= 100) return "#65ae8d";
  if (v <= 200) return "#e4b15e";
  if (v <= 300) return "#df865a";
  return "#c96458";
}
function AQIScale({ value }) {
  const numeric = Number(value);
  const position =
    value == null || value === "" || !Number.isFinite(numeric) || numeric < 0
      ? null
      : numeric <= 50
        ? (numeric / 50) * 10
        : numeric <= 100
          ? 10 + ((numeric - 50) / 50) * 10
          : numeric <= 200
            ? 20 + ((numeric - 100) / 100) * 20
            : numeric <= 300
              ? 40 + ((numeric - 200) / 100) * 20
              : numeric <= 400
                ? 60 + ((numeric - 300) / 100) * 20
                : 80 + (Math.min(100, numeric - 400) / 100) * 20;
  return (
    <div className="scale-block">
      <div className="scale-labels">
        <span>Good</span>
        <span>Satisfactory</span>
        <span>Moderate</span>
        <span>Poor</span>
        <span>Very poor</span>
        <span>Severe</span>
      </div>
      <div className="aqi-gradient">
        {position != null && (
          <span className="scale-marker" style={{ left: `${position}%` }}>
            <i />
          </span>
        )}
      </div>
      <div className="scale-numbers">
        <span>0</span>
        <span>50</span>
        <span>100</span>
        <span>200</span>
        <span>300</span>
        <span>400</span>
        <span>500</span>
      </div>
      {numeric > 500 && (
        <span className="scale-overflow-label">Above scale</span>
      )}
    </div>
  );
}
function StatRow({ icon, label, value, context, tone = "" }) {
  return (
    <div className="stat-row">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{context}</small>
    </div>
  );
}
function Notice({ icon, title, body }) {
  return (
    <section className="notice-card">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </section>
  );
}
function LoadingNotice() {
  return (
    <div className="notice-card">
      <span className="spinner" />
      <div>
        <strong>Loading city history</strong>
        <p>Reading archived air quality measurements…</p>
      </div>
    </div>
  );
}
function EmptyChart({ message }) {
  return (
    <div className="empty-chart">
      <span>
        <Activity size={19} />
      </span>
      <p>{message}</p>
    </div>
  );
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const band = aqiBand(payload[0].value);
  return (
    <div className="chart-tooltip">
      <span>{dateLabel(label)}</span>
      <b>{fmt(payload[0].value)} AQI</b>
      <i style={{ color: band?.color }}>{band?.label || "No data"}</i>
    </div>
  );
}
function MonthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <b>{fmt(payload[0].value, 1)} mean AQI</b>
      <i>{payload[0].payload.validDays} measured days</i>
    </div>
  );
}

function ForecastPage({
  cities,
  rows,
  selectedCity,
  inputs,
  setInputs,
  result,
  error,
  busy,
  onSubmit,
  onNavigate,
}) {
  const [delhiRows, setDelhiRows] = useState([]);
  useEffect(() => {
    if (selectedCity?.name === "Delhi") setDelhiRows(rows);
    else
      fetch("/data/cities/delhi.json")
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .then((d) => setDelhiRows(d.rows || []))
        .catch(() => setDelhiRows([]));
  }, [selectedCity?.id, rows]);
  const sourceRows = delhiRows.filter((r) => r.aqi != null);
  const selectedInputRow = sourceRows.find((r) => r.date === inputs.date);
  const band = result ? aqiBand(result.predicted) : null;
  const outOfRange = result && (result.predicted < 0 || result.predicted > 500);
  const update = (key, value) => setInputs((v) => ({ ...v, [key]: value }));
  const prefill = () => {
    const archived = selectedInputRow;
    if (!archived) return;
    setInputs((v) => ({
      ...v,
      date: archived.date,
      aqi_today: archived.aqi == null ? "" : String(archived.aqi),
      ...Object.fromEntries(
        POLLUTANTS.map((p) => [
          p,
          archived[p] == null ? "" : String(archived[p]),
        ]),
      ),
    }));
  };
  const observed = result
    ? sourceRows.find((r) => r.date === result.targetDate && r.aqi != null)
    : null;
  return (
    <>
      <section className="page-intro subpage-intro">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> MODEL PLAYGROUND{" "}
            <span className="eyebrow-chip orange">DELHI · 1-DAY HORIZON</span>
          </div>
          <h1>
            Forecast <em>lab.</em>
          </h1>
          <p>Explore a next-day scenario using the saved Delhi model.</p>
        </div>
        <div className="intro-stamp">
          <FlaskConical size={17} />
          <span>
            MODEL
            <br />
            SANDBOX
          </span>
        </div>
      </section>
      <div className="forecast-banner">
        <div className="banner-icon">
          <Info size={18} />
        </div>
        <p>
          <strong>Scope matters.</strong> This Random Forest was trained on
          Delhi data from 2015–2020. Enter a scenario date and same-day AQI;
          pollutant fields can be left blank and are filled with training
          medians. This is a model replay, not a live forecast or public
          advisory.
        </p>
        <span className="banner-period">DELHI · 1 DAY</span>
      </div>
      <section className="forecast-layout">
        <article className="chart-card forecast-form-card">
          <div className="section-card-header">
            <div>
              <div className="card-kicker">SET UP A SCENARIO</div>
              <h2>Your prediction inputs</h2>
              <p>Use your own values or prefill from a recorded Delhi day.</p>
            </div>
            <span className="chart-icon">
              <FlaskConical size={16} />
            </span>
          </div>
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field-label" htmlFor="forecast-date">
              SCENARIO MEASUREMENT DATE
            </label>
            <div className="date-field">
              <CalendarDays size={17} />
              <input
                id="forecast-date"
                aria-label="Scenario measurement date"
                type="date"
                value={inputs.date}
                onChange={(e) => update("date", e.target.value)}
                required
              />
              <span className="date-next-day">→ next day</span>
            </div>
            <label className="numeric-field aqi-input-field">
              <span>TODAY’S AQI · REQUIRED</span>
              <input
                aria-label="Today's AQI"
                type="number"
                min="0"
                step="any"
                required
                value={inputs.aqi_today || ""}
                onChange={(e) => update("aqi_today", e.target.value)}
                placeholder="Enter current-day AQI"
              />
              <small>Must be a non-negative number</small>
            </label>
            <div className="prefill-row">
              <span className="prefill-context">
                {selectedInputRow
                  ? `Archive reading available for ${dateLabel(inputs.date)}`
                  : "Choose a date from the 2015–2020 archive to prefill recorded values"}
              </span>
              <button
                type="button"
                onClick={prefill}
                disabled={!selectedInputRow}
              >
                Prefill from archive
              </button>
            </div>
            <div className="form-note">
              <Info size={14} />
              Blank pollutant fields use the training median.
            </div>
            <p className="scenario-date-note">
              The date labels this scenario. The model uses the AQI and
              pollutant readings, not the calendar date.
            </p>
            <div className="form-section-label">
              <span>OPTIONAL POLLUTANTS</span>
              <span>source units unverified</span>
            </div>
            <div className="input-grid">
              {POLLUTANTS.map((p) => (
                <label className="numeric-field" key={p}>
                  <span>{p}</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={inputs[p]}
                    onChange={(e) => update(p, e.target.value)}
                    placeholder="Training median"
                    aria-label={`${p} input`}
                  />
                  <small>
                    {selectedInputRow?.[p] == null
                      ? "Optional · blank = median"
                      : `Archive: ${fmt(selectedInputRow[p], 2)}`}
                  </small>
                </label>
              ))}
            </div>
            {error && (
              <div className="inline-error" role="alert">
                <Info size={16} />
                {error}
              </div>
            )}
            <button type="submit" className="run-button" disabled={busy}>
              {busy ? (
                <>
                  <span className="button-spinner" />
                  Running model…
                </>
              ) : (
                <>
                  <Activity size={16} /> Predict next day{" "}
                  <ArrowUpRight size={16} />
                </>
              )}
            </button>
          </form>
        </article>
        <article
          className={`forecast-result ${result ? "has-result" : ""}`}
          style={{ "--band-color": band?.color || "#72b49b" }}
        >
          <div className="result-kicker">
            <span className="result-live-dot" /> MODEL SCENARIO{" "}
            <span className="result-model">RANDOM FOREST</span>
          </div>
          {result ? (
            <>
              <span className="target-date">
                PREDICTED FOR · {dateLabel(result.targetDate)}
              </span>
              <div className="result-value">{fmt(result.predicted, 1)}</div>
              <div className="result-caption">
                predicted AQI{" "}
                <span className="result-band">
                  {band?.label || (outOfRange ? "Outside AQI scale" : "—")}
                </span>
              </div>
              {outOfRange && (
                <div className="out-of-range">
                  <Info size={14} />
                  Raw model output is shown without clipping to the 0–500 AQI
                  scale.
                </div>
              )}
              <div className="result-scale">
                <AQIScale value={result.predicted} />
              </div>
              <div className="result-comparison">
                <div>
                  <span>SCENARIO INPUT</span>
                  <strong>{fmt(result.source.aqi)} AQI</strong>
                  <small>{dateLabel(result.inputDate)}</small>
                </div>
                <div className="compare-arrow">
                  <ArrowDownRight size={17} />
                </div>
                <div>
                  <span>MODEL OUTPUT</span>
                  <strong>{fmt(result.predicted, 1)} AQI</strong>
                  <small>{dateLabel(result.targetDate)}</small>
                </div>
              </div>
              {observed && (
                <div className="observed-comparison">
                  <div>
                    <span>HISTORICAL REFERENCE · OBSERVED NEXT-DAY AQI</span>
                    <strong>
                      {fmt(observed.aqi)} <small>AQI</small>
                    </strong>
                  </div>
                  <div>
                    <span>ABSOLUTE DIFFERENCE</span>
                    <strong>
                      {fmt(
                        Math.abs(result.predicted - Number(observed.aqi)),
                        1,
                      )}{" "}
                      <small>AQI points</small>
                    </strong>
                  </div>
                  <p>
                    This archived observation is a historical comparison, not an
                    independent score for a manually entered scenario.
                  </p>
                </div>
              )}
              <div className="result-foot">
                <ShieldCheck size={15} /> Offline model scenario · not a live
                advisory
              </div>
            </>
          ) : (
            <div className="result-empty">
              <span className="result-orbit">
                <Activity size={25} />
              </span>
              <strong>Your result will appear here</strong>
              <p>
                Enter a scenario date and today’s AQI, then run the model to see
                its next-day estimate.
              </p>
              <div className="result-placeholder">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </article>
      </section>
      <section className="method-strip">
        <div className="method-item">
          <span className="method-number">01</span>
          <div>
            <strong>Historical input</strong>
            <small>Daily Delhi measurements</small>
          </div>
        </div>
        <ChevronRight size={16} className="method-chevron" />
        <div className="method-item">
          <span className="method-number">02</span>
          <div>
            <strong>Random Forest</strong>
            <small>200 trees · depth 10</small>
          </div>
        </div>
        <ChevronRight size={16} className="method-chevron" />
        <div className="method-item">
          <span className="method-number">03</span>
          <div>
            <strong>Next-day estimate</strong>
            <small>One calendar day ahead</small>
          </div>
        </div>
        <button onClick={() => onNavigate("report")}>
          Read model report <ChevronRight size={15} />
        </button>
      </section>
    </>
  );
}

function ReportPage({ report, error, onRetry }) {
  if (error)
    return (
      <>
        <SubpageIntro
          eyebrow="MODEL CARD"
          title={
            <>
              Model <em>report.</em>
            </>
          }
          text="How the experiment was trained, tested, and measured."
        />
        <Notice
          icon={<Info size={18} />}
          title="Report could not load"
          body={error}
        />
        <button className="retry-button" onClick={onRetry}>
          Retry report
        </button>
      </>
    );
  if (!report)
    return (
      <>
        <SubpageIntro
          eyebrow="MODEL CARD"
          title={
            <>
              Model <em>report.</em>
            </>
          }
          text="How the experiment was trained, tested, and measured."
        />
        <LoadingNotice />
      </>
    );
  const meta = report.metadata || {};
  const metrics = report.metrics || meta.test_metrics || {};
  const selected = metrics.selected_model || {};
  const baseline = metrics.persistence || {};
  const predictions = report.predictions || [];
  const importance = report.importance || [];
  const rankedImportance = [...importance].sort(
    (a, b) => Math.abs(b.increase_in_mae) - Math.abs(a.increase_in_mae),
  );
  const split = meta.splits || {};
  const improvement =
    baseline.MAE && selected.MAE
      ? (1 - selected.MAE / baseline.MAE) * 100
      : null;
  return (
    <>
      <SubpageIntro
        eyebrow="MODEL CARD"
        title={
          <>
            Model <em>report.</em>
          </>
        }
        text="A clear view of what the Delhi forecasting experiment learned, and where its limits are."
      />
      <section className="report-hero">
        <div>
          <div className="card-kicker">
            HELD-OUT TEST SET · {split.test?.target_start || "2019-09"} —{" "}
            {split.test?.target_end || "2020-07"}
          </div>
          <h2>
            Better than carrying
            <br />
            yesterday forward.
          </h2>
          <p>
            On this historical test window, the Random Forest reduced mean
            absolute error against a simple persistence baseline.
          </p>
          <div className="report-hero-foot">
            <span>
              <Check size={14} /> Chronological holdout
            </span>
            <span>
              <Check size={14} /> One-day horizon
            </span>
            <span>
              <Check size={14} /> Delhi only
            </span>
          </div>
        </div>
        <div className="hero-metric">
          <span>MAE IMPROVEMENT</span>
          <strong>
            {improvement == null ? "—" : `${fmt(improvement, 1)}%`}
          </strong>
          <small>over persistence</small>
        </div>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="Mean absolute error"
          value={fmt(selected.MAE, 2)}
          unit="AQI points"
          note="Typical absolute prediction error"
          accent="green"
        />
        <MetricCard
          label="Root mean square error"
          value={fmt(selected.RMSE, 2)}
          unit="AQI points"
          note="Weights larger misses more"
          accent="orange"
        />
        <MetricCard
          label="R² score"
          value={fmt(selected.R2, 3)}
          unit="test set"
          note="Explained variance vs. mean"
          accent="navy"
        />
        <MetricCard
          label="Persistence MAE"
          value={fmt(baseline.MAE, 2)}
          unit="AQI points"
          note="Predict tomorrow = today's AQI"
          accent="muted"
        />
      </section>
      <section className="chart-card baseline-card">
        <div className="section-card-header">
          <div>
            <div className="card-kicker">SAME 299 TEST DAYS</div>
            <h2>Compare every baseline</h2>
            <p>
              Lower MAE and RMSE mean smaller errors; higher R² means a better
              fit.
            </p>
          </div>
        </div>
        <div className="baseline-table-wrap">
          <table className="baseline-table">
            <thead>
              <tr>
                <th scope="col">Predictor</th>
                <th scope="col">MAE</th>
                <th scope="col">RMSE</th>
                <th scope="col">R²</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Random Forest", selected],
                ["Persistence", baseline],
                ["Development mean", metrics.development_mean || {}],
              ].map(([name, score]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{fmt(score.MAE, 3)}</td>
                  <td>{fmt(score.RMSE, 3)}</td>
                  <td>{fmt(score.R2, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="baseline-note">
          MAE and RMSE are in AQI points. Persistence carries today’s AQI
          forward. Development mean uses the average target from training plus
          validation. R² is not percentage accuracy.
        </p>
      </section>
      <section className="chart-grid report-chart-grid">
        <article className="chart-card">
          <div className="section-card-header chart-heading">
            <div>
              <div className="card-kicker">
                HELD-OUT TEST TIMELINE · 299 DAYS
              </div>
              <h2>Recorded, predicted &amp; baseline AQI</h2>
              <p>
                Daily test-set target values from September 2019 to July 2020
              </p>
            </div>
            <span className="chart-icon">
              <Activity size={16} />
            </span>
          </div>
          <div className="chart-plot parity-plot">
            <PredictionTimeline predictions={predictions} />
          </div>
        </article>
        <article className="chart-card importance-card">
          <div className="section-card-header chart-heading">
            <div>
              <div className="card-kicker">INPUT INFLUENCE</div>
              <h2>Permutation importance</h2>
              <p>Change in validation MAE after shuffling a feature</p>
            </div>
            <span className="chart-icon">
              <Wind size={16} />
            </span>
          </div>
          <div className="importance-list">
            {rankedImportance.length ? (
              rankedImportance.map((item, i) => (
                <div
                  className={`importance-row ${item.increase_in_mae < 0 ? "negative" : ""}`}
                  key={item.feature}
                >
                  <div className="importance-label">
                    <span className="importance-rank">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{item.feature}</strong>
                    <span className="importance-value">
                      {item.increase_in_mae >= 0 ? "+" : ""}
                      {fmt(item.increase_in_mae, 2)}
                    </span>
                  </div>
                  <div className="importance-track">
                    <i
                      style={{
                        width: `${Math.max(2, (Math.abs(item.increase_in_mae) / Math.max(...rankedImportance.map((d) => Math.abs(d.increase_in_mae || 0), 1))) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>± {fmt(item.std, 2)} AQI points</small>
                </div>
              ))
            ) : (
              <EmptyChart message="Feature importance is not available." />
            )}
          </div>
          <div className="unit-note">
            <Info size={14} />
            <span>
              Importance is computed on the validation window before the final
              model refit. It shows predictive reliance, not cause.
            </span>
          </div>
        </article>
      </section>
      <section className="chart-card split-card">
        <div className="section-card-header">
          <div>
            <div className="card-kicker">EVALUATION DESIGN</div>
            <h2>Time-respecting data splits</h2>
            <p>
              Future dates stay out of the training and model selection windows.
            </p>
          </div>
          <span className="chart-icon">
            <CalendarDays size={16} />
          </span>
        </div>
        <div className="split-timeline">
          {["train", "validation", "test"].map((name, i) => {
            const s = split[name] || {};
            return (
              <div className={`split-stage stage-${name}`} key={name}>
                <span className="split-index">0{i + 1}</span>
                <div className="split-stage-head">
                  <strong>{name}</strong>
                  <span>{fmt(s.rows)} days</span>
                </div>
                <div className="split-bar">
                  <i />
                </div>
                <div className="split-dates">
                  <span>{s.origin_start || "—"}</span>
                  <span>{s.origin_end || "—"}</span>
                </div>
                <small>Forecast target ends {s.target_end || "—"}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="limitations-card">
        <div className="limitations-heading">
          <span>
            <Info size={17} />
          </span>
          <div>
            <div className="card-kicker">READ BEFORE INTERPRETING</div>
            <h2>What these scores can and cannot tell you</h2>
          </div>
        </div>
        <div className="limitations-grid">
          <div>
            <strong>Historical experiment</strong>
            <p>
              The test period ends in 2020. These scores do not establish
              performance on today's air or on future years.
            </p>
          </div>
          <div>
            <strong>Delhi-specific model</strong>
            <p>
              Training used Delhi city-day records only. The model is not
              validated for other cities or stations.
            </p>
          </div>
          <div>
            <strong>Observation availability</strong>
            <p>
              Same-day AQI must be available before prediction. Pollutant gaps
              use fitted training medians; publication delays are not modeled.
            </p>
          </div>
          <div>
            <strong>Predictions can exceed the scale</strong>
            <p>
              Raw model estimates are retained. Five held-out outputs were
              outside the 0–500 AQI range and are not clipped.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
function MetricCard({ label, value, unit, note, accent }) {
  return (
    <article className={`metric-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
      <p>{note}</p>
    </article>
  );
}
function PredictionTimeline({ predictions }) {
  return predictions.length ? (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={predictions}
        margin={{ top: 4, right: 10, left: -19, bottom: 0 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="#e9ece7"
          strokeDasharray="3 5"
        />
        <XAxis
          dataKey="date"
          tickFormatter={(v) =>
            dateLabel(v, { month: "short", day: "numeric" })
          }
          tick={{ fill: "#84918b", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          minTickGap={36}
        />
        <YAxis
          tick={{ fill: "#84918b", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<PredictionTooltip />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={27}
          wrapperStyle={{ fontSize: 8, color: "#708078" }}
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="actual"
          name="Observed"
          stroke="#465f54"
          strokeWidth={1.6}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="predicted"
          name="Random Forest"
          stroke="#31846e"
          strokeWidth={1.8}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="persistence"
          name="Persistence"
          stroke="#bf9160"
          strokeWidth={1.25}
          strokeDasharray="4 4"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  ) : (
    <EmptyChart message="The 299-day prediction timeline is not available." />
  );
}
function PredictionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const record = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span>{dateLabel(label)}</span>
      <b>Observed {fmt(record.actual, 1)} AQI</b>
      <i>Random Forest {fmt(record.predicted, 1)}</i>
      <i>Persistence {fmt(record.persistence, 1)}</i>
    </div>
  );
}
function SubpageIntro({ eyebrow, title, text }) {
  return (
    <section className="page-intro subpage-intro">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-line" /> {eyebrow}{" "}
          <span className="eyebrow-chip">2015—2020</span>
        </div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="intro-stamp">
        <ShieldCheck size={17} />
        <span>
          OPEN
          <br />
          METHODS
        </span>
      </div>
    </section>
  );
}

function AboutPage({ source, pollutants, onNavigate }) {
  return (
    <>
      <SubpageIntro
        eyebrow="PROJECT NOTES"
        title={
          <>
            About <em>Vayu.</em>
          </>
        }
        text="A student-built window into historical air quality and a carefully scoped forecasting experiment."
      />
      <section className="about-lead">
        <div className="about-mark">
          <Wind size={30} />
        </div>
        <div>
          <span className="card-kicker">AI FOR ENGINEERS · UCS321</span>
          <h2>
            Make the data easier to see, and the limits easier to understand.
          </h2>
          <p>
            Vayu brings a 2015–2020 India city-day air quality dataset together
            with a Delhi-only next-day AQI model. Use it to explore
            observations, inspect coverage, and replay the saved model on a
            recorded day.
          </p>
        </div>
      </section>
      <section className="about-grid">
        <article className="chart-card about-card">
          <div className="card-kicker">THE DATASET</div>
          <h2>Historical city-day observations</h2>
          <p>
            Measurements in this atlas come from the project’s supplied India
            air quality dataset. Values remain as recorded; pollutant units have
            not been independently verified.
          </p>
          <div className="about-facts">
            <div>
              <span>TIME SPAN</span>
              <strong>{source?.dateRange || "2015–2020"}</strong>
            </div>
            <div>
              <span>LOCATIONS</span>
              <strong>Indian cities</strong>
            </div>
            <div>
              <span>MEASURES</span>
              <strong>{pollutants.length || 6} pollutants + AQI</strong>
            </div>
          </div>
          {source?.url && (
            <a
              className="source-link"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              View dataset source <ExternalLink size={14} />
            </a>
          )}
        </article>
        <article className="chart-card about-card">
          <div className="card-kicker">THE MODEL</div>
          <h2>One day ahead, in Delhi</h2>
          <p>
            A Random Forest regressor uses same-day AQI and pollutant readings
            to predict AQI on the following calendar day. The model was selected
            on a chronological validation period and scored on a later held-out
            window.
          </p>
          <div className="about-model-tag">
            <span />
            <strong>Random Forest</strong>
            <small>200 trees · depth 10 · Delhi</small>
          </div>
          <button className="text-button" onClick={() => onNavigate("report")}>
            Explore model evaluation <ChevronRight size={15} />
          </button>
        </article>
      </section>
      <section className="limitations-card about-reading">
        <div className="limitations-heading">
          <span>
            <Info size={17} />
          </span>
          <div>
            <div className="card-kicker">USING THE DASHBOARD</div>
            <h2>Read the measurements in context</h2>
          </div>
        </div>
        <div className="limitations-grid">
          <div>
            <strong>Pick a city, day, or year</strong>
            <p>
              The overview lets you move between daily readings and annual
              patterns for each city in the archive.
            </p>
          </div>
          <div>
            <strong>Check coverage</strong>
            <p>
              Annual averages use available AQI observations. Coverage shows the
              share of calendar days with a reading; partial years remain
              partial.
            </p>
          </div>
          <div>
            <strong>Understand AQI bands</strong>
            <p>
              Labels follow the India AQI categories published by the Central
              Pollution Control Board.{" "}
              <a
                href="https://cpcb.nic.in/National-Air-Quality-Index/"
                target="_blank"
                rel="noreferrer"
              >
                Read CPCB’s AQI methodology <ExternalLink size={11} />
              </a>
            </p>
          </div>
          <div>
            <strong>Use it for learning</strong>
            <p>
              This academic demonstration is not an official monitor, medical
              tool, or public warning service.
            </p>
          </div>
        </div>
      </section>
      <section className="source-strip">
        <div className="source-emblem">
          <FlaskConical size={16} />
        </div>
        <div>
          <strong>Curious how the model was evaluated?</strong>
          <span>
            See the split dates, error measures, and model limitations.
          </span>
        </div>
        <button onClick={() => onNavigate("report")}>
          Open model report <ChevronRight size={15} />
        </button>
      </section>
    </>
  );
}

export default App;
