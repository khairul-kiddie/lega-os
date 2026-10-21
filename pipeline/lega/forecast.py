"""LightGBM quantile forecast of daily portfolio energy + honest backtest.

Target ("actual"): daily kWh/kWp from the pvlib simulation of NASA POWER satellite irradiance.
Features: archived NWP forecasts from the Open-Meteo Historical Forecast API (available from
2017-01-02), plus season and lagged output. The Historical Forecast API stitches together the
first hours of each model run, so its inputs are short-lead (same-day) forecasts. As a stricter
check we re-score 2024-2025 using the Previous Runs API's true day-ahead (day-1 lead) forecasts.

Quantiles: alpha 0.1 -> P90 (safe to promise), 0.5 -> P50, 0.9 -> P10.
P90 is conformally calibrated on 2022 (held out from a 2017-2021 fit) before the final fit.
"""
import json

import lightgbm as lgb
import numpy as np
import pandas as pd
import requests

from .config import DATA, RAW, SITE, WEB_DATA

HF_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
PR_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
FC_START, TRAIN_END, CAL_YEAR, TEST_START, END = "2017-01-02", "2022-12-31", 2022, "2023-01-01", "2025-12-31"

# Reference portfolio for MWh figures: ~93 factory roofs (the Innovation Park sample plan) ≈ 10 MWp.
PORTFOLIO_KWP = 10_000
# Sample buyer demand for charts: Innovation Park, 12,000 MWh/yr × 95% office-hours share.
DEMAND_MWH_DAY = round(12_000 * 0.95 / 365, 1)

DAILY_VARS = ["shortwave_radiation_sum", "precipitation_sum", "precipitation_hours", "cloud_cover_mean",
              "temperature_2m_mean", "relative_humidity_2m_mean", "sunshine_duration"]
FEATURES = ["fc_ghi", "fc_precip", "fc_precip_hours", "fc_cloud", "fc_temp", "fc_rh", "fc_sun_hours",
            "doy_sin", "doy_cos", "monsoon", "past_week", "lag2"]
FEATURE_LABEL = {
    "fc_ghi": "Forecast sunlight (irradiance)", "fc_precip": "Forecast rainfall", "fc_precip_hours": "Forecast rain hours",
    "fc_cloud": "Forecast cloud cover", "fc_temp": "Forecast temperature", "fc_rh": "Forecast humidity",
    "fc_sun_hours": "Forecast sunshine hours", "doy_sin": "Time of year", "doy_cos": "Time of year",
    "monsoon": "Monsoon season", "past_week": "Last week's output", "lag2": "Output two days ago",
}
Q = {"p90": 0.1, "p50": 0.5, "p10": 0.9}
PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=30,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1, random_state=42)


def _cached_get(url: str, params: dict, name: str) -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    if path.exists():
        return json.loads(path.read_text())
    r = requests.get(url, params=params, timeout=180)
    r.raise_for_status()
    path.write_text(r.text)
    return r.json()


def historical_forecasts() -> pd.DataFrame:
    frames = []
    for y in range(2017, 2026):
        start = FC_START if y == 2017 else f"{y}-01-01"
        d = _cached_get(HF_URL, {"latitude": SITE["lat"], "longitude": SITE["lon"], "start_date": start, "end_date": f"{y}-12-31",
                                 "daily": ",".join(DAILY_VARS), "timezone": SITE["tz"]}, f"openmeteo_hf_{y}.json")["daily"]
        frames.append(pd.DataFrame(d))
    return _rename(pd.concat(frames))


def _rename(df: pd.DataFrame) -> pd.DataFrame:
    df["date"] = pd.to_datetime(df.pop("time"))
    df = df.set_index("date")
    out = pd.DataFrame(index=df.index)
    out["fc_ghi"] = df["shortwave_radiation_sum"] / 3.6  # MJ/m2 -> kWh/m2
    out["fc_precip"] = df["precipitation_sum"]
    out["fc_precip_hours"] = df["precipitation_hours"]
    out["fc_cloud"] = df["cloud_cover_mean"]
    out["fc_temp"] = df["temperature_2m_mean"]
    out["fc_rh"] = df["relative_humidity_2m_mean"]
    out["fc_sun_hours"] = df["sunshine_duration"] / 3600
    return out


def day_ahead_forecasts() -> pd.DataFrame:
    """True day-1-lead forecasts from the Previous Runs API (hourly -> daily)."""
    hv = ["shortwave_radiation", "precipitation", "cloud_cover", "temperature_2m", "relative_humidity_2m", "sunshine_duration"]
    frames = []
    for y in (2024, 2025):
        d = _cached_get(PR_URL, {"latitude": SITE["lat"], "longitude": SITE["lon"], "start_date": f"{y}-01-01", "end_date": f"{y}-12-31",
                                 "hourly": ",".join(f"{v}_previous_day1" for v in hv), "timezone": SITE["tz"]},
                        f"openmeteo_prev_day1_{y}.json")["hourly"]
        frames.append(pd.DataFrame(d))
    h = pd.concat(frames)
    h["time"] = pd.to_datetime(h["time"])
    h = h.set_index("time")
    h.columns = [c.replace("_previous_day1", "") for c in h.columns]
    g = h.groupby(h.index.normalize())
    complete = g["shortwave_radiation"].count() == 24
    out = pd.DataFrame({
        "fc_ghi": g["shortwave_radiation"].sum() / 1000,
        "fc_precip": g["precipitation"].sum(),
        "fc_precip_hours": g["precipitation"].apply(lambda s: (s > 0.1).sum()),
        "fc_cloud": g["cloud_cover"].mean(),
        "fc_temp": g["temperature_2m"].mean(),
        "fc_rh": g["relative_humidity_2m"].mean(),
        "fc_sun_hours": g["sunshine_duration"].sum() / 3600,
    })[complete]
    out.index.name = "date"
    return out


def add_calendar_and_lags(df: pd.DataFrame, actual: pd.Series) -> pd.DataFrame:
    doy = df.index.dayofyear
    df = df.copy()
    df["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    # Northeast monsoon (Nov-Mar) is the cloudiest period on the west coast
    df["monsoon"] = df.index.month.isin([11, 12, 1, 2, 3]).astype(int)
    # Lags end two days before the target day: when forecasting tomorrow, today isn't over yet.
    a = actual.reindex(pd.date_range(actual.index.min(), actual.index.max()))
    df["lag2"] = a.shift(2).reindex(df.index)
    df["past_week"] = a.shift(2).rolling(7).mean().reindex(df.index)
    return df


def weather_class(kt: pd.Series, precip: pd.Series) -> pd.Series:
    """From NASA clearness index (GHI / clear-sky GHI) and rainfall."""
    cls = pd.Series("cloudy", index=kt.index)
    cls[kt >= 0.80] = "sunny"
    cls[(precip >= 10) | (kt < 0.65)] = "rain"
    cls[(precip >= 30) | (kt < 0.50)] = "storm"
    return cls


def fit(X: pd.DataFrame, y: pd.Series) -> dict:
    return {k: lgb.LGBMRegressor(objective="quantile", alpha=a, **PARAMS).fit(X, y) for k, a in Q.items()}


def predict(models: dict, X: pd.DataFrame, p90_shift: float = 0.0) -> pd.DataFrame:
    p = pd.DataFrame({k: m.predict(X) for k, m in models.items()}, index=X.index)
    p["p90"] = p["p90"] - p90_shift
    # keep quantiles ordered
    p["p50"] = np.maximum(p["p50"], p["p90"])
    p["p10"] = np.maximum(p["p10"], p["p50"])
    return p.clip(lower=0)


def mape(actual, pred) -> float:
    return float(np.mean(np.abs(pred - actual) / actual) * 100)


def score(actual: pd.Series, p: pd.DataFrame) -> dict:
    return {"days": int(len(actual)), "p90_hit_rate": round(float((actual >= p["p90"]).mean()), 3),
            "p50_mape_pct": round(mape(actual, p["p50"]), 1),
            "p10_exceed_rate": round(float((actual > p["p10"]).mean()), 3)}


def run():
    sim = pd.read_csv(DATA / "daily_sim.csv", index_col="date", parse_dates=True)
    actual = sim["kwh_per_kwp"]
    hf = historical_forecasts()
    df = add_calendar_and_lags(hf, actual).join(actual.rename("y")).dropna()
    train = df[df.index <= TRAIN_END]
    test = df[df.index >= TEST_START]

    # 1) conformal calibration of P90: fit on 2017-2021, measure miss rate on 2022
    pre = train[train.index.year < CAL_YEAR]
    cal = train[train.index.year == CAL_YEAR]
    m_pre = fit(pre[FEATURES], pre["y"])
    cal_p90 = m_pre["p90"].predict(cal[FEATURES])
    resid = cal_p90 - cal["y"].to_numpy()  # positive = actual fell below P90
    n = len(resid)
    shift = float(max(0.0, np.quantile(resid, min(1.0, np.ceil((n + 1) * 0.9) / n))))
    raw_cal_hit = float((cal["y"].to_numpy() >= cal_p90).mean())

    # 2) final fit on 2017-2022, score on 2023-2025 (never seen in training)
    models = fit(train[FEATURES], train["y"])
    p = predict(models, test[FEATURES], shift)
    p_raw = predict(models, test[FEATURES], 0.0)
    y = test["y"]

    # baselines for context
    clim = actual[actual.index <= TRAIN_END].groupby(actual[actual.index <= TRAIN_END].index.month).mean()
    clim_mape = mape(y, y.index.month.map(clim).to_numpy())

    # 3) day-ahead check with Previous Runs day-1 forecasts
    try:
        da = add_calendar_and_lags(day_ahead_forecasts(), actual).join(actual.rename("y")).dropna()
        da = da[(da.index >= TEST_START) & (da.index <= END)]
        p_da = predict(models, da[FEATURES], shift)
        day_ahead = {**score(da["y"], p_da), "from": str(da.index.min().date()), "to": str(da.index.max().date()),
                     "source": "Open-Meteo Previous Runs API (day-1 lead)"}
    except Exception as e:  # network/API failure must not kill the pipeline
        day_ahead = {"error": str(e)}

    # weather classes on test days
    kt = (sim["ghi"] / sim["ghi_clear"]).reindex(y.index)
    wc = weather_class(kt, sim["precip"].reindex(y.index))
    by_class = []
    for c in ["sunny", "cloudy", "rain", "storm"]:
        m = wc == c
        if m.sum() == 0:
            continue
        e = mape(y[m], p["p50"][m])
        by_class.append({"class": c, "days": int(m.sum()), "p50_mape_pct": round(e, 1),
                         "p90_hit_rate": round(float((y[m] >= p["p90"][m]).mean()), 3),
                         "trust": "High" if e < 10 else "Medium" if e < 20 else "Low"})

    to_mwh = PORTFOLIO_KWP / 1000  # kWh/kWp -> MWh for the reference portfolio
    # 4) wettest week in the test period
    rain7 = sim["precip"].reindex(y.index).rolling(7).sum()
    wk_end = rain7.idxmax()
    wk = slice(wk_end - pd.Timedelta(days=6), wk_end)
    short = lambda promise: float(np.clip(promise[wk] - y[wk], 0, None).sum() * to_mwh)
    wettest = {"start": str((wk_end - pd.Timedelta(days=6)).date()), "end": str(wk_end.date()),
               "rain_mm": round(float(rain7.max()), 1),
               "delivered_mwh": round(float(y[wk].sum() * to_mwh), 1),
               "shortfall_if_p50_mwh": round(short(p["p50"]), 1),
               "shortfall_if_p90_mwh": round(short(p["p90"]), 1),
               "promised_p50_mwh": round(float(p["p50"][wk].sum() * to_mwh), 1),
               "promised_p90_mwh": round(float(p["p90"][wk].sum() * to_mwh), 1)}

    # 5) 14-day sample window around the wettest week
    start = wk_end - pd.Timedelta(days=10)
    win = pd.date_range(start, periods=14)
    sample = [{"date": str(d.date()), "weather": wc[d], "p90": round(p.loc[d, "p90"] * to_mwh, 1),
               "p50": round(p.loc[d, "p50"] * to_mwh, 1), "p10": round(p.loc[d, "p10"] * to_mwh, 1),
               "actual": round(y[d] * to_mwh, 1), "rain_mm": round(float(sim.loc[d, "precip"]), 1)}
              for d in win if d in p.index]

    # 6) feature importance (gain) from the P50 model, grouped by plain-English label
    gain = pd.Series(models["p50"].booster_.feature_importance("gain"), index=FEATURES)
    gain = gain.groupby(gain.index.map(FEATURE_LABEL)).sum()
    gain = (gain / gain.sum()).sort_values(ascending=False).head(6)

    result = {
        "approach": "forecast_features",
        "approach_label": "Inputs are archived weather forecasts (Open-Meteo Historical Forecast API), not observed weather.",
        "caveat": "The Historical Forecast archive is built from the first hours of each forecast run (same-day lead), which flatters accuracy.",
        "actual_source": "pvlib simulation of NASA POWER satellite irradiance (not metered output)",
        "model": "LightGBM quantile regression (alpha 0.1 / 0.5 / 0.9)",
        "train_period": f"{FC_START} to {TRAIN_END}", "test_period": f"{TEST_START} to {END}",
        "calibration": {"method": "Conformal shift of P90 fitted on 2022 (model trained 2017–2021)",
                        "p90_shift_mwh": round(shift * to_mwh, 2), "raw_p90_hit_rate_2022": round(raw_cal_hit, 3)},
        "portfolio_kwp": PORTFOLIO_KWP, "demand_mwh_day": DEMAND_MWH_DAY,
        "test": score(y, p), "test_uncalibrated": score(y, p_raw),
        "baseline_climatology_mape_pct": round(clim_mape, 1),
        "day_ahead_check": day_ahead,
        "by_weather": by_class,
        "weather_class_rules": {"sunny": "clearness ≥ 0.80", "cloudy": "0.65–0.80", "rain": "clearness < 0.65 or rain ≥ 10 mm",
                                "storm": "clearness < 0.50 or rain ≥ 30 mm"},
        "wettest_week": wettest,
        "sample_window": sample,
        "feature_importance": [{"feature": k, "share": round(float(v), 3)} for k, v in gain.items()],
    }
    (WEB_DATA / "forecast_backtest.json").write_text(json.dumps(result, indent=1, ensure_ascii=False))
    import joblib  # bundled with scikit-learn
    (DATA.parent / "models").mkdir(exist_ok=True)
    joblib.dump({"models": models, "shift": shift}, DATA.parent / "models" / "quantile.joblib")
    return result


if __name__ == "__main__":
    r = run()
    print(json.dumps({k: r[k] for k in ("test", "test_uncalibrated", "baseline_climatology_mape_pct", "day_ahead_check", "calibration", "by_weather", "wettest_week", "feature_importance")}, indent=1))
