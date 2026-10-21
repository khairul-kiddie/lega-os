"""Single source of truth for site and system settings."""
from pathlib import Path

# City of Elmina, Selangor (Wikipedia infobox: 3°11'57"N 101°30'02"E).
# NASA POWER resolution is ~0.5° x 0.625°, so the whole township shares one grid cell.
SITE = {"name": "City of Elmina, Selangor", "lat": 3.1992, "lon": 101.5006, "tz": "Asia/Kuala_Lumpur", "altitude_m": 30}

# PVWatts-style rooftop system
SYSTEM = {"tilt_deg": 10, "azimuth_deg": 180, "losses_pct": 14.0, "gamma_pdc": -0.0037, "inverter_eff": 0.96}

YIELD_SANITY_RANGE = (1100, 1500)  # kWh/kWp/yr, Peninsular Malaysia rooftops

HIST_START, HIST_END = "2015-01-01", "2025-12-31"
TRAIN_END = "2022-12-31"  # test = 2023-2025

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DATA = ROOT / "data"
WEB_DATA = ROOT.parent / "web" / "public" / "data"
SEED = 42
