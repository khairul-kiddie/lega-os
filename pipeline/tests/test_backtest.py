import json

import pytest

from lega.config import WEB_DATA
from lega.formulas import p90_coverage

B = json.loads((WEB_DATA / "forecast_backtest.json").read_text())


def test_test_period_is_unseen():
    assert B["train_period"].endswith("2022-12-31")
    assert B["test_period"].startswith("2023-01-01")


def test_p90_hit_rate_near_target():
    assert 0.85 <= B["test"]["p90_hit_rate"] <= 0.97


def test_sample_window_coverage_matches_formula():
    w = B["sample_window"]
    assert len(w) == 14
    cov = p90_coverage([d["actual"] for d in w], [d["p90"] for d in w])
    assert cov == pytest.approx(sum(d["actual"] >= d["p90"] for d in w) / 14)
    assert all(d["p90"] <= d["p50"] <= d["p10"] for d in w)


def test_p90_promise_beats_p50_in_wettest_week():
    wk = B["wettest_week"]
    assert wk["shortfall_if_p90_mwh"] < wk["shortfall_if_p50_mwh"]
