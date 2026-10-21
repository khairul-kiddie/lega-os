"""Live 14-day forecast -> web/public/data/forecast_live.json.

Calls the Open-Meteo forecast API (16-day horizon) and runs the trained quantile models.
Lag features come from recent NASA POWER days (simulated with pvlib); NASA's near-real-time
feed lags a few days, so the most recent week's mean is held constant across the horizon.
If any API call fails, the last cached forecast_live.json is kept and marked stale.

Open-Meteo is free for non-commercial use; commercial deployment needs a paid plan.
"""
import json
from datetime import date, datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd
import requests

from .config import DATA, SITE, WEB_DATA
from .forecast import DAILY_VARS, DEMAND_MWH_DAY, FEATURES, PORTFOLIO_KWP, _rename, predict
from .simulate import hourly_from_daily

FC_URL = "https://api.open-meteo.com/v1/forecast"
NASA_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
OUT = WEB_DATA / "forecast_live.json"


def recent_actuals(today: date) -> pd.Series:
    start, end = today - timedelta(days=40), today - timedelta(days=1)
    r = requests.get(NASA_URL, timeout=60, params={
        "parameters": "ALLSKY_SFC_SW_DWN,T2M,WS2M", "community": "RE", "latitude": SITE["lat"], "longitude": SITE["lon"],
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"})
    r.raise_for_status()
    p = r.json()["properties"]["parameter"]
    df = pd.DataFrame({"ghi": pd.Series(p["ALLSKY_SFC_SW_DWN"]), "temp": pd.Series(p["T2M"]), "wind": pd.Series(p["WS2M"])})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999.0, np.nan).dropna()
    h = hourly_from_daily(df)
    return (h["ac_w"].groupby(h.index.tz_localize(None).normalize()).sum() / 1000).reindex(df.index)


def typical(sim: pd.DataFrame, days: pd.DatetimeIndex) -> dict:
    """Per-day P50/P90 for these calendar days across 2015-2025."""
    doy = set(days.dayofyear)
    hist = sim.loc[sim.index.dayofyear.isin(doy), "kwh_per_kwp"]
    return {"p50": float(hist.median()), "p90": float(hist.quantile(0.10)), "p10": float(hist.quantile(0.90)), "years": "2015–2025"}


def run(today: date | None = None) -> dict:
    today = today or datetime.now(timezone(timedelta(hours=8))).date()
    sim = pd.read_csv(DATA / "daily_sim.csv", index_col="date", parse_dates=True)
    bundle = joblib.load(DATA.parent / "models" / "quantile.joblib")
    to_mwh = PORTFOLIO_KWP / 1000
    try:
        r = requests.get(FC_URL, timeout=60, params={"latitude": SITE["lat"], "longitude": SITE["lon"], "daily": ",".join(DAILY_VARS),
                                                     "forecast_days": 16, "timezone": SITE["tz"]})
        r.raise_for_status()
        fc = _rename(pd.DataFrame(r.json()["daily"]))
        fc = fc[fc.index.date > today].head(14)

        try:
            recent = recent_actuals(today).dropna()
            lag_src = f"NASA POWER near-real-time, last data {recent.index.max().date()}"
        except Exception:
            recent = pd.Series(dtype=float)
            lag_src = "climatology (NASA POWER near-real-time unavailable)"
        clim = sim["kwh_per_kwp"].groupby(sim.index.month).mean()
        past_week = float(recent.tail(7).mean()) if len(recent) >= 7 else float(clim[today.month])
        lag2 = float(recent.iloc[-1]) if len(recent) else float(clim[today.month])

        X = fc.copy()
        doy = X.index.dayofyear
        X["doy_sin"], X["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
        X["monsoon"] = X.index.month.isin([11, 12, 1, 2, 3]).astype(int)
        X["past_week"], X["lag2"] = past_week, lag2
        p = predict(bundle["models"], X[FEATURES], bundle["shift"])

        later = pd.date_range(today + timedelta(days=15), today + timedelta(days=30))
        t = typical(sim, later)
        out = {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "issued_for": str(today), "stale": False,
            "source": "Open-Meteo forecast API (16-day) + LightGBM quantile models",
            "lag_source": lag_src,
            "note": "Backtest validates day-1 accuracy only; days 8–14 are medium confidence and not separately backtested.",
            "portfolio_kwp": PORTFOLIO_KWP, "demand_mwh_day": DEMAND_MWH_DAY,
            "days": [{"date": str(d.date()), "horizon": i + 1, "confidence": "high" if i < 7 else "medium",
                      "p50": round(p.loc[d, "p50"] * to_mwh, 1), "p90": round(p.loc[d, "p90"] * to_mwh, 1),
                      "p10": round(p.loc[d, "p10"] * to_mwh, 1),
                      "rain_mm": round(float(fc.loc[d, "fc_precip"]), 1), "cloud_pct": round(float(fc.loc[d, "fc_cloud"]))}
                     for i, d in enumerate(p.index)],
            "days_15_30_typical": {"from": str(later[0].date()), "to": str(later[-1].date()),
                                   "p50": round(t["p50"] * to_mwh, 1), "p90": round(t["p90"] * to_mwh, 1),
                                   "basis": f"Same calendar days, {t['years']} (pvlib on NASA POWER)"},
        }
    except Exception as e:
        if not OUT.exists():
            raise
        out = json.loads(OUT.read_text())
        out["stale"] = True
        out["stale_reason"] = f"Live API unavailable ({type(e).__name__}); showing last cached forecast."
        print("WARNING:", out["stale_reason"])
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


if __name__ == "__main__":
    o = run()
    print(o.get("lag_source"), "stale" if o["stale"] else "fresh")
    for d in o["days"]:
        print(d)
    print(o["days_15_30_typical"])
