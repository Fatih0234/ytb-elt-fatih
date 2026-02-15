import pytest

from ytb_elt.logic.alerts import AlertRule, should_trigger_velocity_spike
from ytb_elt.logic.duration import parse_youtube_duration_to_seconds
from ytb_elt.logic.metrics import compute_views_per_hour


@pytest.mark.parametrize(
    "duration,expected",
    [
        ("PT15S", 15),
        ("PT1M2S", 62),
        ("PT1H3M", 3780),
        ("PT2H", 7200),
        ("PT0S", 0),
        ("P1DT1H", 90000),
    ],
)
def test_parse_youtube_duration_to_seconds(duration, expected):
    assert parse_youtube_duration_to_seconds(duration) == expected


def test_compute_views_per_hour():
    assert compute_views_per_hour(1000, 3600) == 1000.0
    assert compute_views_per_hour(300, 1800) == 600.0


def test_compute_views_per_hour_invalid():
    with pytest.raises(ValueError):
        compute_views_per_hour(10, 0)


def test_alert_trigger_decision_true():
    rule = AlertRule(watchlist_id="w", video_type="long", multiplier=2.5, abs_floor_vph=5000, min_age_minutes=30, max_age_hours=24)
    assert (
        should_trigger_velocity_spike(
            video_age_minutes=60,
            video_age_hours=1.0,
            vph=20000,
            baseline_vph=6000,
            rule=rule,
        )
        is True
    )


def test_alert_trigger_decision_false_floor():
    rule = AlertRule(watchlist_id="w", video_type="long", multiplier=2.5, abs_floor_vph=5000, min_age_minutes=30, max_age_hours=24)
    assert (
        should_trigger_velocity_spike(
            video_age_minutes=60,
            video_age_hours=1.0,
            vph=4999,
            baseline_vph=1000,
            rule=rule,
        )
        is False
    )

