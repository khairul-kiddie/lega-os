"""Roof score: 40% yield + 20% shading + 20% roof condition + 20% likelihood to sign.

Yield comes from the pvlib simulation; shading and roof condition are SAMPLE (synthetic) until
building heights and surveys are available; likelihood to sign is rule-based on owner attributes.
"""
import numpy as np

WEIGHTS = {"yield": 0.4, "shading": 0.2, "condition": 0.2, "likelihood": 0.2}
LIKELIHOOD_BASE = {"Owner-occupier": 68, "Investor landlord": 48, "Multinational tenant": 58, "Landlord": 42,
                   "Management body": 40, "Public body": 55}


def yield_score(specific_yield: float, site_yield: float) -> float:
    # 100 = site best case (no shading, ideal tilt); 0 = 25% below it
    return float(np.clip((specific_yield / site_yield - 0.75) / 0.25 * 100, 0, 100))


def likelihood(owner: str, condition: float, years_left: int, attended: bool) -> tuple[float, list[str]]:
    """Rule-based likelihood to sign, with reasons."""
    s, why = LIKELIHOOD_BASE[owner], [owner]
    if years_left >= 15:
        s += 10; why.append(f"{years_left} yrs on lease/title")
    elif years_left < 8:
        s -= 15; why.append(f"only {years_left} yrs left on lease")
    if condition < 50:
        s -= 10; why.append("roof needs repair first")
    if attended:
        s += 12; why.append("attended SDP solar briefing")
    return float(np.clip(s, 0, 100)), why


def headline(parts: dict, shade_loss: float, age: int, owner: str, attended: bool, years_left: int) -> str:
    """Short plain-English reason for the leasing list, e.g. 'Top yield, no shading, roof 6 yrs old'."""
    y = parts["yield"]
    lead = "Top yield" if y >= 95 else "High yield" if y >= 85 else "Good yield" if y >= 70 else "Lower yield"
    extras = []
    if parts["condition"] < 50:
        extras.append("roof needs repair")
    if years_left < 8:
        extras.append("short lease left")
    if shade_loss < 0.5:
        extras.append("no shading")
    elif shade_loss < 3:
        extras.append("light shade")
    if age <= 8:
        extras.append(f"roof {age} yr{'' if age == 1 else 's'} old")
    if attended:
        extras.append("attended solar talk")
    if owner == "Owner-occupier":
        extras.append("owner-occupied")
    return ", ".join([lead, *extras[:2]])
