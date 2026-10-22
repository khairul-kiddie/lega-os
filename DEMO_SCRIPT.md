# LEGA OS — 5-minute demo script

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh private window. The sample portfolios and the Innovation Park leasing pipeline load automatically.
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:30 | **Roof map** (Business park) | Land on the page. Point at the KPI tiles. | "SDP wants to lease rooftops across its townships and sell the power to nearby businesses. LEGA OS answers three questions: which roofs, how many, and how much can we safely promise. This is Elmina Business Park, 597 roofs scored. Green zones average 80 or more. Just 7 factory owners would give us a gigawatt-hour a year." |
| 0:30–1:05 | **Zone i41** | In *Best zones to start with*, click **Zone i41**. The best roof is preselected. | "28 factory roofs, all of them good. This one scores 95. The yield comes from 11 years of real NASA satellite weather, simulated with pvlib at 1,287 kWh per kWp per year, which is inside the normal Malaysian range. Shading, condition and owner data are sample data for now." |
| 1:05–1:20 | Homes | Click **← Roof map**, then the **Homes** toggle. | "Homes work too, but a gigawatt-hour takes about 160 home owners instead of 7 factory owners. Hold that thought." |
| 1:20–2:20 | **Portfolio builder** | **Portfolio builder**, then **Open plan** on *Innovation Park, Elmina*. | "Innovation Park needs 1,800 MWh a year in office hours, so solar can cover 95% of it. From homes alone we'd need 313 roofs, but only 155 home roofs score 75 or more. The plan says so honestly: the available roofs would cover only 53% in the worst month." Tick **Elmina Business Park**: "Add factory roofs and it drops to 21 roofs. Every month is covered, even if one owner in five says no." |
| 2:20–2:45 | **Leasing list** | **Leasing list**. Click the **Signed** filter, then **All**. Change one *To approach* row to **Interested**. | "The outreach team sees every home ranked: why it ranks there, its status, and the next step. Progress counts toward the 313 roofs the plan needs. **Export for field team** gives them a spreadsheet." |
| 2:45–3:25 | **Model insights → Roof scoring model** | Opens on **Best home** (Lot 102, Precinct 4). Click **Best factory**, then back. | "Each score comes from four steps: find the roof, check shading, simulate yield, and combine. Only the yield step uses real data today. The rest is sample data until we have satellite imagery and lease records, and every card says which is which." |
| 3:25–4:20 | **Model insights → Forecast model** | Click **Forecast model**. Scroll to *Did the forecast keep its promises?* Click **23 Nov**. | "This is how much we can promise each day. We trained LightGBM on real archived weather forecasts from 2017–2022 and tested on 2023–2025, years it had never seen. The green line is the P90 promise. In the wettest stretch, delivery met it on 13 of 14 days. 23 November is the one miss, after 60 mm of rain. Over three years the promise held 92.6% of the time, and 86% on true day-ahead forecasts. We show both." |
| 4:20–4:55 | **Firming forecast** | Toggle **Promise P90 (safe)** / **Promise P50 (average)**. Scroll to the backtest cards. | "This is tomorrow's real forecast for Elmina, refreshed every morning. For each week: what we can safely promise, the gap to Innovation Park's demand, and what to do about it. In the wettest week of the test period, promising the average would have left us 4.9 MWh short, a whole day's demand. Promising P90, just 0.1." |
| 4:55–5:00 | Close | Back to **Roof map**. | "LEGA OS: real weather, honest forecasts, and a clear plan from roof to buyer." |

**If something fails live**
- All data ships as static JSON, so the app works offline once it has loaded.
- If the live forecast is out of date, the Firming screen shows a "stale" banner and the last cached forecast.
- To reset the sample data, clear the site's storage in the browser and reload.
