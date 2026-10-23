# LEGA OS — 5-minute demo script

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh private window. City of Elmina is already scanned; the other seven townships are not, so you can scan one live.
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:30 | **Roof map**, all townships | Land on the page. Point at the pins. | "SDP wants to lease rooftops across its townships and sell the power to nearby businesses. LEGA OS answers three questions: which roofs, how many, and how much can we safely promise. Here are SDP's townships. Green means scanned, dashed means not yet. City of Elmina is done: 1,926 roofs scored inside its real boundary, about 93 GWh a year." |
| 0:30–1:10 | **Scan a township** | Click **Bandar Bukit Raja** in the list, then **Scan Bandar Bukit Raja**. | "Scanning works in five steps: fetch imagery, detect buildings, estimate shading, simulate yield on Bukit Raja's own NASA weather, score every roof. In production this runs on fresh imagery; here we replay a precomputed scan." When it finishes: "3,524 buildings inside Bukit Raja's boundary, 1,420 good roofs, about 118 GWh a year." Click **View results**. |
| 1:10–1:35 | **One roof** | Click **Industrial**, then the top roof in *Best roofs to start with*. | "The map flies to the roof. Size and yield are real. Shading and owner data are sample data for now, and the panel says so. Roof types come from the map data where it exists: Bukit Raja has a real industrial area. The 27 best roofs here would give a gigawatt-hour a year." |
| 1:35–1:55 | **City of Elmina: Business park \| Homes** | **← All townships**, click **City of Elmina**, then **Open results**. Switch to **Homes**. | "City of Elmina has two sites, both scanned from satellite data: the business park and the homes. Every roof is clipped to the township's real boundary." |
| 1:55–2:45 | **Portfolio builder** | **Portfolio builder**, then **Open plan** on *Innovation Park, Elmina*. Click **Monsoon-proof**. | "Innovation Park needs 1,800 MWh a year in office hours. From City of Elmina's good roofs we sign up 38, with a 15% buffer. Every month is covered. If one owner in five says no, the worst month drops to 87%, so for a monsoon-proof plan we sign 41 and the worst month stays at 94%." Tick **Bandar Bukit Raja** to show the plan rebalancing. |
| 2:45–3:10 | **Leasing list** | **Leasing list**. Click a roof name. | "The outreach team gets every roof ranked: why it ranks there, its status, and the next step. **Export for field team** gives them a spreadsheet. Clicking a roof shows it on the satellite map." |
| 3:10–3:40 | **Model insights → Roof scoring model** | Opens on **Best home**. Click **Best industrial roof**. | "Each score comes from four steps. The roof outline and yield are real; the outline here is the building's actual footprint. Shading and owner likelihood are sample data until we have LiDAR and lease records." |
| 3:40–4:10 | **Model insights → Forecast model** | Click **Forecast model**. Scroll to *Did the forecast keep its promises?* Click **23 Nov**. | "Before we promise anything, we test the forecast. We trained it on real archived weather forecasts from 2017–2022 and tested it on 2023–2025, years it never saw. Over three years our safe promise held 92.6% of the time, and 86% on true day-ahead forecasts. We show both." |
| 4:10–4:25 | **Firming forecast: what it is** | Click **Firming forecast**. Buyer: *Innovation Park, Elmina*, **Promise P90 (safe)** on. Point at the dark **Tomorrow’s commitment** card. | "The firming forecast turns the weather into a promise. Every morning it takes the 14-day weather forecast for Elmina and works out, for this buyer’s 38 roofs, two numbers per day: the expected output, and the safe amount we are 90% sure to deliver. We promise the safe amount. Tomorrow that’s [read the big number] MWh against a need of 4.7, so the card tells us exactly what to do: [read the suggested action]." |
| 4:25–4:40 | **Firming forecast: how to use it** | Point along the 14-day chart, then the **Two-week plan** table. Toggle **Promise P50 (average)** and back to **P90**. | "Each bar is one day: the light bar is what we expect, the dark bar is what we can safely promise, and the dashed line is the buyer’s need. Days one to seven are reliable enough to commit daily; days eight to fourteen are for planning ahead. The plan table adds it up week by week with an action for each gap: top up from the grid, book backup supply, or sell a surplus. Switch to the average and it looks better on paper, but that is the risky promise." |
| 4:40–4:55 | **Firming forecast: any buyer, proven** | Switch **Buyer** to *Elmina Lakeside Mall*, then scroll to the backtest cards. | "Pick another buyer and everything rescales to that buyer’s roofs and demand. And here is why we promise the safe amount: in the wettest week of our test period, promising the average would have left Innovation Park about 5 MWh short, more than a whole day’s demand. Promising P90, just 0.1." |
| 4:55–5:00 | Close | Back to **Roof map**. | "LEGA OS: real rooftops, honest forecasts, and a clear plan from roof to buyer." |

**Firming forecast cheat sheet (read before recording)**

What it does: tells SDP how much electricity it can safely promise a buyer each day for the next 14 days, and how to cover any shortfall.

| Part of the screen | What it shows | How to use it |
|---|---|---|
| **Buyer** dropdown | Whose supply you are planning; lists every portfolio from the Portfolio builder | Pick a buyer; the whole page rescales to that buyer’s roofs and daily need (yearly demand × daytime share ÷ 365) |
| **Promise P90 / P50** toggle | P90 = the amount we are 90% sure to reach (the safe promise); P50 = the average, a coin flip | Keep P90 on; switch to P50 only to show how much riskier the average is |
| **Tomorrow’s commitment** (dark card) | Tomorrow’s promise, expected output, the buyer’s need and a suggested action | Read the action: gap up to 15% of the need = top up from the grid; bigger gap = book backup supply (battery or grid contract); surplus = offer it to other buyers |
| **Next 14 days** chart | Light bar = expected, dark bar = safe to promise, dashed line = buyer’s need | A dark bar below the line is a day to arrange top-up. Days 1–7 (green) = commit daily; days 8–14 (amber) = plan ahead |
| **Two-week plan** table | Weekly totals: expected, promised, needed, gap, action | The “Days 15–30 (typical)” row is not a forecast: it shows what normally happens on those dates in 11 years of history |
| **Backtest** cards | How often the P90 promise held on 3 unseen years (92.6%) and the wettest-week shortfall, rescaled to this buyer | The proof that promising P90 is safer than promising the average |

The forecast refreshes every morning automatically. The numbers on the card change daily, so read them off the screen rather than memorising them.

**If something fails live**
- The township data ships with the site. Only the satellite tiles come from Esri, so record on a good connection.
- If the live forecast is out of date, the Firming screen shows a "stale" banner and the last cached forecast.
- To reset the demo (scans, portfolios, leasing list), clear the site's storage in the browser and reload.
- The scan replay takes about 6 seconds; don't click away mid-scan or that township won't be marked as scanned.
