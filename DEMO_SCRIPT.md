# LEGA OS — 5-minute demo script (v2, community-first)

**The story in one line:** community first, commercially funded. SDP's solar and batteries keep schools, surau, evacuation centres and street lamps running; power left over is sold to local businesses to pay for it.

**Before recording**
- Open https://khairul-kiddie.github.io/lega-os/ in a fresh private window (so the planner starts clean).
- Use a window about 1440 px wide, with browser zoom at 100%.
- Keep this script open on a second screen.

| Time | Screen | Click path | Say |
|---|---|---|---|
| 0:00–0:30 | **Roof map** (overview) | Land on the page. Point along the top row of tiles. | "Our mentors at SDP told us three things: give back to the community, own the energy ecosystem, and help plan Kulai. So LEGA OS now opens with community numbers: buildings that are bill-neutral, hours of backup at evacuation centres, street lamps at risk this week, CO₂ avoided, and bills saved. Business sales are still here, in the small tile on the right: they fund all of this." |
| 0:30–1:30 | **Community energy planner** | **Community energy planner**. Point at the priority column. **+ New asset** → **Community hall / evacuation centre (PPS)** card → name *Dewan Komuniti Elmina (PPS)* → **Typical size** → **SDP-owned**, **Critical** → **Continue** → **Both**, **48 h** → **Next**. | "These are City of Elmina's real schools, surau and clinics from OpenStreetMap, ranked by need: criticality, people served, flood risk and bill, not revenue. Let's add the evacuation centre. It must cut its bills *and* stay on in an outage for 48 hours. Grid-tied solar switches off in a blackout, so that always means a battery." |
| 1:30–2:00 | **Plan** | Point at the four numbers, the 24-hour chart, then the checks and **Funded by**. | "28 kWp on its own roof and a 234 kWh battery. The grey area is the night load the battery covers. It is bill-neutral and SDP-owned. In the wettest week of the last 11 years it lasts about 152 of 168 hours, and the plan says exactly how much solar to add to stay on all week. About 530 MWh a year of commercial sales pays this battery back in 10 years." |
| 2:00–2:50 | **Battery controller** | **Battery controller** (Dewan Komuniti, Storm drill). Point at the storm banner and the chart. Then **Simulate grid outage** (Fri 03:00 or similar, +36 h). | "This is the battery brain. It runs the next 72 hours of real forecast weather. A storm is coming, so a day ahead it raises the reserve from 30% to 100% and tops up. Now the grid fails in the middle of the storm: the hall switches to emergency mode and stays on to the end of the forecast. Without storm prep it would have gone dark after about a day. It's behind the meter on SDP property: no TNB wires needed." |
| 2:50–3:30 | **Street-light watch** | **Street-light watch**. Click the top lamp in the list, then **Maintenance plan**. | "Street lamps run at night, so rooftop solar can't help. Each lamp has its own panel and battery. We run the 7-day forecast through every lamp: these few will go dark, and here's why: tree shade, a worn battery, rainy days ahead. One click gives the crew a Thursday route, road by road." |
| 3:30–4:30 | **Plan a new township (Kulai)** | **Plan a new township**. Drag **Street grid rotation** 0 → 90. Change **2-storey terrace (hip)** to **Gable**. Tick **Solar-ready construction**. In Phase 2, **Send to planner**. | "Kulai doesn't exist yet, so we plan from the layout. We used real hourly weather for Kulai. Rotate the whole street grid: almost nothing changes, because near the equator a pitched roof always has a face toward the sun. Switch hip roofs to gable: a big jump, because gables have half again the usable roof. Solar-ready construction avoids retrofit costs for every home. And the evacuation centre goes straight into the planner, with a battery sized the same way." |
| 4:30–5:00 | Close | **Model insights → Orientation study (Kulai)**, then back to **Roof map**. | "Every number comes from real weather and real buildings, with sample loads clearly marked. LEGA OS: community first, commercially funded. The schools, surau, evacuation centres and street lamps stay on, and local business pays for it." |

**Numbers to know**

| | |
|---|---|
| City of Elmina | 14 of 14 community buildings, 4,131 solar street lamps, 1,259 t CO₂/yr, 48.9 GWh/yr left for businesses |
| New PPS (typical 25 MWh/yr, both, 48 h) | 28.4 kWp, 234 kWh battery, ≈ 152 h in the P90 wettest week (needs +4.4 kWp for all 7 days) |
| Wettest week (P90), Elmina | 2.18 kWh/kWp a day vs 3.52 typical |
| Lamps in the community plan | 0 dark nights 2015–2025; 255 dark nights in the worst group with a one-night battery |
| Kulai | Rotate the grid: about +0.05%; hip → gable: about +41%; pitch 30° → 15°: about +5% |
| Innovation Park (commercial) | 38 roofs balanced, 41 monsoon-proof |

The battery controller and street-light watch use the live forecast, which refreshes every morning, so read those numbers off the screen rather than memorising them.

**If a judge asks…**
- *"Does solar keep the hall on in a blackout?"* Only with a battery. Grid-tied inverters shut off for safety; the planner only offers outage backup with a battery.
- *"Are you replacing TNB?"* No. SDP owns panels and batteries behind the meter on its own property. Power from a leased neighbour roof reaches a building over TNB's wires (NEM / CRESS); the grid still backs everything up.
- *"Why aren't street lamps on the rooftop plan?"* They run at night, when solar output is zero. They are standalone solar lamps with their own panel and battery.
- *"Is roof direction really that unimportant?"* For a whole house, yes: one face changes by up to 4% at 20° tilt (east is slightly best, thanks to clearer mornings), but a gable house has two opposite faces, so the house total moves about 0.1%. Pitch and roof shape matter more.
- *"Are the buildings and loads real?"* Buildings and roads are real (OpenStreetMap). Loads, people served, flood zones, prices, battery sites and lamp specs are sample values, and every screen says so.
- *"Who pays?"* Commercial buyers of the surplus. The planner shows the commercial MWh each battery needs.

**If something fails live**
- All data ships with the site. Only the satellite tiles come from Esri, so record on a good connection.
- If the live forecast is out of date, the screens still work from the last cached forecast.
- To reset the demo (planner, portfolios, leasing list), clear the site's storage in the browser and reload.
- If the live 72-hour forecast has its own storm, the **Live forecast** button will show storm prep too; the **Storm drill** always does.
