# LEGA OS — 5-minute demo script

**The story in one line:** SDP's own rooftops power the township first (schools, surau, halls, clinics, and every street lamp, every night), and the power left over is sold to local businesses to pay for it.

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh private window. City of Elmina is already scanned; the other seven townships are not, so you can scan one live.
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:25 | **Roof map**, all townships | Land on the page. Point at the pins. | "A township of tomorrow should run on its own sunshine. SDP has thousands of roofs across its townships. LEGA OS turns them into community power: first for the schools, surau and street lamps, and only then for business. Here are SDP's townships; green ones are scanned." |
| 0:25–0:55 | **Scan a township** | Click **Bandar Bukit Raja**, then **Scan Bandar Bukit Raja**. When done, **View results**. | "Scanning works in five steps: fetch imagery, detect buildings, estimate shading, simulate yield on Bukit Raja's own NASA weather, and score every roof. Here we replay a precomputed scan. 3,524 buildings inside Bukit Raja's real boundary, 1,420 good roofs." |
| 0:55–1:45 | **Community plan** | **Community plan** (City of Elmina). Point at the four numbers. Click **SJK (C) Ladang Regent** in the table, then **Al-Amin Darul Musthopa**. | "This is the heart of it. Every school, surau, hall and clinic here is a real building from OpenStreetMap. All 14 run on solar. This school powers itself from its own roof, with a battery for after dark. This one has no usable roof, so one good roof nearby shares with it. We size for the cloudiest month, not the average." |
| 1:45–2:30 | **Street lamps that never go dark** | Scroll to the lamp section. Point at the chart and the three cards. | "Street lamps are the hard part: they only run at night. City of Elmina has about 4,100 lamps on 133 km of road, in 37 groups. Each group gets roofs that charge a battery by day. We replayed every one of 4,018 days of real weather since 2015 through every group. Not one night went dark, and the batteries never fell below a 20% reserve. With a battery that only held one night, the worst group would have gone dark 246 times." |
| 2:30–2:45 | **Plan to rooftops** | Click **Send 58 roofs to leasing**. | "58 roofs power all of this: 1,420 tonnes of CO₂ a year off the grid. We send them to the leasing team first." |
| 2:45–3:25 | **Lights-on forecast** | **Lights-on forecast**. Point at the dark card and the chart. Click **30%**, then **Full**. | "Every morning we take the 14-day weather forecast and run it through every lamp group. Today: all lamps stay lit. If a storm week is coming, a group gets flagged early: dim after midnight, or pre-charge from the grid. If the batteries start at only 30%, the safe forecast shows them climbing back above the reserve within days." |
| 3:25–4:00 | **Surplus buyers** | **Surplus buyers**, then **Open plan** on *Innovation Park, Elmina*. Click **Monsoon-proof**. | "Community roofs are reserved first, so business plans can't take them. City of Elmina still has 46 GWh a year left over. Innovation Park needs 1,800 MWh a year: 39 roofs with a 15% buffer, or 43 for a monsoon-proof plan that keeps 96% of the worst month even if one owner in five says no. That income pays for the batteries and upkeep." |
| 4:00–4:15 | **Leasing list** | **Leasing list**. | "The outreach team sees community roofs first, then business roofs, each with why it ranks there and the next step. **Export for field team** gives them a spreadsheet." |
| 4:15–4:45 | **Model insights → Forecast model** | **Model insights**, **Forecast model**, scroll to *Did the forecast keep its promises?* | "Every promise rests on this forecast. We trained it on real archived forecasts from 2017–2022 and tested it on 2023–2025, years it never saw. The safe amount held 92.6% of the time, and 86% on true day-ahead forecasts. We show both." |
| 4:45–5:00 | Close | Back to **Community plan**. | "LEGA OS: SDP's roofs power the township first. Schools and surau run on sunshine, the street lamps never go dark, and the surplus pays for it." |

**Numbers to know (City of Elmina)**

| | |
|---|---|
| Community buildings | 14 of 14 powered (7 from their own roof, 7 sharing nearby roofs) |
| Street lamps | 4,131 estimated on 133 km of road, 37 groups, 0 dark nights 2015–2025 |
| Hardest morning | 26% battery left, all groups together, 13 Jan 2018 |
| Without a proper battery | 246 dark nights in the worst group (one-night battery) |
| CO₂ | 1,420 t a year at 0.740 t/MWh (Energy Commission, Peninsular 2024) |
| Roofs used | 58 (52 of them good roofs); 46.2 GWh a year left for businesses |
| Innovation Park | 39 roofs (balanced), 43 roofs (monsoon-proof, 96% worst month with dropout) |

**If a judge asks…**
- *"Are the facilities real?"* Yes: names and locations come from OpenStreetMap. Energy use per building is a typical figure until SDP shares TNB bills.
- *"Are the lamps real?"* The roads are real; lamp positions are estimated (one every 30–40 m) because OpenStreetMap maps only 50 lamps in Elmina. The council's lamp register would replace this.
- *"How does power get from a neighbour's roof to the school?"* Through SDP-owned private wiring inside the township, or via NEM or CRESS. The exact route is to be confirmed with the Energy Commission and the council.
- *"Who pays?"* The surplus sold to local businesses (46 GWh a year in Elmina alone).

**Lights-on forecast cheat sheet**

| Part of the screen | What it shows | How to use it |
|---|---|---|
| **Street lamps / Business buyers** tabs | Lamps (default) or the surplus forecast for a business buyer | Stay on Street lamps for the community story |
| **Battery charge tonight** | Starting charge: there is no live battery data yet | Show *30%* to demonstrate recovery, then back to *Full* |
| Dark card | Whether every lamp stays lit for 14 nights, and the lowest charge | Read the headline and the action box |
| Chart | Each morning's charge: dark line = safe (P90), light line = expected (P50), dashed = 20% reserve | A dot below the dashed line is a group to act on |
| **Groups to act on** | Groups that dip below the reserve: dim after midnight, or pre-charge from the grid | Usually empty; that's the point |

The forecast refreshes every morning automatically, so read the numbers off the screen rather than memorising them.

**If something fails live**
- The township and community data ship with the site. Only the satellite tiles come from Esri, so record on a good connection.
- If the live forecast is out of date, the forecast screen shows a "stale" banner and the last cached forecast.
- To reset the demo (scans, portfolios, leasing list), clear the site's storage in the browser and reload.
- The scan replay takes about 6 seconds; don't click away mid-scan or that township won't be marked as scanned.
