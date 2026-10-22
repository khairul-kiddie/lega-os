"""Daily AC energy per 1 kWp from NASA POWER daily data, via pvlib (PVWatts-style).

NASA POWER gives daily GHI totals, so each day is disaggregated to hourly by scaling the
pvlib clear-sky GHI curve to match the day's measured total. Hourly GHI is split into
DNI/DHI with the Erbs model, transposed to the tilted plane (Perez), and run through the
PVWatts DC + inverter models with SAPM cell temperature.
"""
import json

import numpy as np
import pandas as pd
import pvlib

from . import nasa_power
from .config import DATA, SITE, SYSTEM, WEB_DATA, YIELD_SANITY_RANGE

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def hourly_from_daily(daily: pd.DataFrame, site: dict = SITE) -> pd.DataFrame:
    loc = pvlib.location.Location(site["lat"], site["lon"], SITE["tz"], SITE["altitude_m"])
    start = daily.index.min()
    end = daily.index.max() + pd.Timedelta(hours=23, minutes=30)
    # mid-hour timestamps so each sample represents the full hour
    times = pd.date_range(start, end, freq="1h", tz=SITE["tz"]) + pd.Timedelta(minutes=30)
    solpos = loc.get_solarposition(times)
    cs = loc.get_clearsky(times, model="ineichen", solar_position=solpos)

    day = times.tz_localize(None).normalize()
    cs_daily = cs["ghi"].groupby(day).sum() / 1000  # kWh/m2/day
    scale = (daily["ghi"] / cs_daily.reindex(daily.index)).clip(0, 1.2)
    ghi = cs["ghi"].to_numpy() * scale.reindex(day).to_numpy()

    erbs = pvlib.irradiance.erbs(ghi, solpos["zenith"], times)
    dni_extra = pvlib.irradiance.get_extra_radiation(times)
    airmass = pvlib.atmosphere.get_relative_airmass(solpos["apparent_zenith"])
    poa = pvlib.irradiance.get_total_irradiance(
        SYSTEM["tilt_deg"], SYSTEM["azimuth_deg"], solpos["apparent_zenith"], solpos["azimuth"],
        erbs["dni"], ghi, erbs["dhi"], dni_extra=dni_extra, airmass=airmass, model="perez",
    )
    temp_air = daily["temp"].reindex(day).to_numpy()
    wind = daily["wind"].reindex(day).to_numpy()
    params = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["close_mount_glass_glass"]
    t_cell = pvlib.temperature.sapm_cell(poa["poa_global"], temp_air, wind, **params)

    pdc0 = 1000.0  # W per kWp
    dc = pvlib.pvsystem.pvwatts_dc(poa["poa_global"], t_cell, pdc0, SYSTEM["gamma_pdc"])
    dc = dc * (1 - SYSTEM["losses_pct"] / 100)
    ac = pvlib.inverter.pvwatts(dc, pdc0 / 1.1, eta_inv_nom=SYSTEM["inverter_eff"])
    ac = np.clip(np.nan_to_num(np.asarray(ac)), 0, None)
    return pd.DataFrame({"ac_w": ac, "poa": np.asarray(poa["poa_global"]), "ghi": ghi}, index=times)


def annual_yield(lat: float, lon: float) -> float:
    """Mean annual kWh/kWp for any point (NASA POWER cell + same PVWatts system)."""
    daily = nasa_power.load(lat, lon)
    h = hourly_from_daily(daily, {"lat": lat, "lon": lon})
    kwh = h["ac_w"].groupby(h.index.tz_localize(None).year).sum() / 1000
    return float(kwh[kwh.index <= 2025].mean())


def run():
    daily = nasa_power.load()
    hourly = hourly_from_daily(daily)
    day = hourly.index.tz_localize(None).normalize()
    out = daily.copy()
    out["kwh_per_kwp"] = (hourly["ac_w"].groupby(day).sum() / 1000).reindex(daily.index)
    out["poa_kwh_m2"] = (hourly["poa"].groupby(day).sum() / 1000).reindex(daily.index)
    out["clearness"] = (out["ghi"] / out["ghi_clear"]).clip(0, 1.2)
    out.to_csv(DATA / "daily_sim.csv")

    by_year = out["kwh_per_kwp"].groupby(out.index.year).sum()
    full_years = by_year[out["kwh_per_kwp"].groupby(out.index.year).count() >= 365]
    annual = float(full_years.mean())
    monthly = out["kwh_per_kwp"].groupby([out.index.year, out.index.month]).sum().groupby(level=1)
    m_mean, m_p10 = monthly.mean(), monthly.quantile(0.10)
    daily_by_month = out["kwh_per_kwp"].groupby(out.index.month).mean()

    lo, hi = YIELD_SANITY_RANGE
    ok = lo <= annual <= hi
    print(f"Annual specific yield: {annual:.0f} kWh/kWp/yr  (years: {full_years.round(0).to_dict()})")
    print("SANITY OK" if ok else f"WARNING: outside {lo}-{hi} kWh/kWp/yr")

    # Hourly shape (average share of daily energy per hour), used for usage-pattern overlap.
    hour = hourly.index.hour
    shape = hourly["ac_w"].groupby(hour).sum()
    shape = (shape / shape.sum()).round(4)

    result = {
        "source": "NASA POWER daily (community RE) 2015-2025 + pvlib PVWatts simulation",
        "site": SITE, "system": SYSTEM,
        "annual_kwh_per_kwp": round(annual, 1),
        "annual_by_year": {int(k): round(float(v), 1) for k, v in full_years.items()},
        "sanity": {"range": [lo, hi], "ok": ok},
        "monthly": [
            {"month": MONTHS[m - 1], "kwh_per_kwp": round(float(m_mean[m]), 1),
             "p10_kwh_per_kwp": round(float(m_p10[m]), 1),
             "daily_mean": round(float(daily_by_month[m]), 3)}
            for m in range(1, 13)
        ],
        "hourly_shape": {int(h): float(v) for h, v in shape.items() if v > 0},
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "yield.json").write_text(json.dumps(result, indent=1))
    return result


if __name__ == "__main__":
    r = run()
    for m in r["monthly"]:
        print(m)
