# Data preparation and cleaning

Source CSV: 29531 rows across 26 cities.
Selected city: Delhi; 2009 original daily records.
Date range: 2015-01-01 through 2020-07-01.
Removed exact duplicates: 0.
Conflicting city/date duplicates cause an error rather than silent averaging.
Eligible next-day samples: 1993; removed for missing current or next-day AQI: 16.
Targets join on the same city and exactly the next calendar day; a gap is never treated as tomorrow.
Negative, infinite and nonnumeric readings are replaced with missing values. Genuine high readings are retained.
Missing targets and current AQI are never imputed. Pollutant medians and missingness indicators are fitted inside each pipeline.

| Field | Missing % in city data | Invalid values replaced |
|---|---:|---:|
| PM2.5 | 0.100 | 0 |
| PM10 | 3.833 | 0 |
| NO2 | 0.100 | 0 |
| SO2 | 5.475 | 0 |
| CO | 0.000 | 0 |
| O3 | 4.181 | 0 |
| AQI | 0.498 | 0 |

Entirely missing training inputs excluded: none.
Raw-file SHA-256: `0d84b21c3e4878bbad8df362f2ab05f61ad959538dddf5918e714077ed3c1847`.

Observed AQI above 500: 48 city records. These source labels were retained; verify their derivation before interpreting values against the 0-500 official display bands.
