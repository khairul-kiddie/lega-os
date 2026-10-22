# LEGA OS — 5-minute demo script

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh private window. City of Elmina is already scanned; the other seven townships are not, so you can scan one live.
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:30 | **Roof map**, all townships | Land on the page. Point at the pins. | "SDP wants to lease rooftops across its townships and sell the power to nearby businesses. LEGA OS answers three questions: which roofs, how many, and how much can we safely promise. Here are SDP's townships. Green means scanned, dashed means not yet. City of Elmina is done: 4,939 roofs scored, about 180 GWh a year." |
| 0:30–1:10 | **Scan a township** | Click **Bandar Bukit Raja** in the list, then **Scan Bandar Bukit Raja**. | "Scanning works in five steps: fetch imagery, detect buildings, estimate shading, simulate yield on Bukit Raja's own NASA weather, score every roof. In production this runs on fresh imagery; here we replay a precomputed scan." When it finishes: "4,518 buildings, 1,985 good roofs, about 400 GWh a year." Click **View results**. |
| 1:10–1:35 | **One roof** | Click **Factories**, then the top roof in *Best roofs to start with*. | "The map flies to the roof. Size and yield are real. Shading and owner data are sample data for now, and the panel says so. Just 5 big factory roofs here would give a gigawatt-hour." |
| 1:35–1:55 | **City of Elmina: Business park \| Homes** | **← All townships**, click **City of Elmina**, then **Open results**. Click zone **i41**. | "City of Elmina has two sites. The business park opens on SDP's master plan, so we can plan roofs that aren't built yet. Here's one zone, roof by roof." Then switch to **Homes**: "and the homes, on satellite imagery." |
| 1:55–2:45 | **Portfolio builder** | **Portfolio builder**, then **Open plan** on *Innovation Park, Elmina*. Click **Monsoon-proof**. | "Innovation Park needs 1,800 MWh a year in office hours. From City of Elmina's good roofs we sign up 53, with a 15% buffer. Every month is covered. If one owner in five says no, the worst month drops to 88%, so for a monsoon-proof plan we sign a few more." Tick **Bandar Bukit Raja** to show the plan rebalancing. |
| 2:45–3:10 | **Leasing list** | **Leasing list**. Click a roof name. | "The outreach team gets every roof ranked: why it ranks there, its status, and the next step. **Export for field team** gives them a spreadsheet. Clicking a roof shows it on the satellite map." |
| 3:10–3:40 | **Model insights → Roof scoring model** | Opens on **Best home**. Click **Best factory**. | "Each score comes from four steps. The roof outline and yield are real; the outline here is the factory's actual footprint. Shading and owner likelihood are sample data until we have LiDAR and lease records." |
| 3:40–4:25 | **Model insights → Forecast model** | Click **Forecast model**. Scroll to *Did the forecast keep its promises?* Click **23 Nov**. | "This is how much we can promise each day. We trained LightGBM on real archived weather forecasts from 2017–2022 and tested on 2023–2025. In the wettest stretch, delivery met the P90 promise on 13 of 14 days. Over three years it held 92.6% of the time, and 86% on true day-ahead forecasts. We show both." |
| 4:25–4:55 | **Firming forecast** | Toggle **Promise P90 (safe)** / **Promise P50 (average)**. Scroll to the backtest cards. | "Tomorrow's real forecast for Elmina, refreshed every morning, with the gap to Innovation Park's demand and what to do about it. In the wettest week, promising the average would have left us 4.9 MWh short, a whole day's demand. Promising P90, 0.1." |
| 4:55–5:00 | Close | Back to **Roof map**. | "LEGA OS: real rooftops, honest forecasts, and a clear plan from roof to buyer." |

**If something fails live**
- The township data ships with the site. Only the satellite tiles come from Esri, so record on a good connection.
- If the live forecast is out of date, the Firming screen shows a "stale" banner and the last cached forecast.
- To reset the demo (scans, portfolios, leasing list), clear the site's storage in the browser and reload.
- The scan replay takes about 6 seconds; don't click away mid-scan or that township won't be marked as scanned.
