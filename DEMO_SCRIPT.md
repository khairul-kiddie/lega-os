# LEGA OS — 5-minute demo script

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh browser profile or private window, so the lists start empty.
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:30 | **Roof map** (Business park) | Land on the page. Point at the KPI tiles. | "SDP wants to lease rooftops across its townships and sell the power to nearby businesses. LEGA OS answers three questions: which roofs, how many, and how much can we safely promise. This is Elmina Business Park. Every zone is scored. Green zones score 80 or more." |
| 0:30–1:10 | **Roof map → zone i41** | In *Best zones to start with*, click **i41**. Click the top-scoring roof tile. | "Zooming into i41: 28 factory roofs, all of them good. This roof scores 95. The yield comes from 11 years of real NASA satellite weather, simulated with pvlib at 1,287 kWh per kWp per year, which is inside the normal Malaysian range. Shading, condition and owner data are sample data for now." Click **Add to leasing list**. |
| 1:10–1:25 | Roof map → Homes | Click **← Roof map**, then the **Homes** toggle. | "Homes work too, but you need about 159 owners for a gigawatt-hour, against a handful of factory owners. That's why we start with the business park." |
| 1:25–2:30 | **Portfolio builder** | **Portfolio builder → + New portfolio**. Buyer name: `Innovation Park`. Demand: `12000` MWh per year. Pattern: **Office hours**. Click **Continue**, then **Calculate requirement**, then **Next: choose roofs**. | "Innovation Park needs 12,000 MWh a year in office hours, so solar can cover about 95% of it. The plan says sign up 93 roofs. That's 81 plus a 15% buffer, and every month is covered, using the real monthly yield profile." |
| 2:30–3:00 | Plan: stress test | Click **Lean**, then back to **Balanced**. Point at the **Dropout buffer** check. Click **Scan roofs** on Serenia City. | "If one in five owners says no, the worst month still covers this share. Need more roofs? Scan another township and the plan rebalances." *(The Serenia scan is simulated.)* Click **Send roofs to leasing list**, then **Open leasing list**. |
| 3:00–3:20 | **Leasing list** | Change the first roof's status to **Signed**. | "The outreach team sees each roof's priority, why it ranks there, and the next step." |
| 3:20–4:20 | **Model insights → Forecast model** | Scroll to *Did the forecast keep its promises?* Hover over **23 Nov**, then click it. | "Here's how much we can promise each day. We trained LightGBM on real archived weather forecasts from 2017–2022 and tested it on 2023–2025. The green line is the P90 promise. On 13 of 14 days in the wettest stretch of the test period, delivery met the promise. 23 November is the one miss: 60 mm of rain." Scroll down: "In that wettest week, promising the average would have left us 32 MWh short. Promising P90, under 1 MWh. On true day-ahead forecasts the hit rate is 86%, and we show that number too." |
| 4:20–4:50 | **Firming forecast** | Toggle **Safe (P90)** / **Expected (P50)**. Scroll the two-week plan. | "This is tomorrow's real forecast for Elmina, refreshed every morning. Days 1–7 are high confidence and days 8–14 medium. For each day: what we can safely promise, the gap to the buyer, and what to do about it." |
| 4:50–5:00 | Close | Back to **Roof map**. | "LEGA OS: real weather, honest forecasts, and a clear plan from roof to buyer." |

**If something fails live**
- All data ships as static JSON, so the app works offline once it has loaded.
- If the live forecast is out of date, the Firming screen shows a "stale" banner and the last cached forecast.
