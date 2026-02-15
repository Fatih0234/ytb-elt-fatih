from dataclasses import dataclass


@dataclass(frozen=True)
class AlertRule:
    watchlist_id: str
    video_type: str  # "short"|"long"
    baseline_window_videos: int = 20
    baseline_hours: float = 6.0
    multiplier: float = 2.5
    abs_floor_vph: float = 5000.0
    min_age_minutes: int = 30
    max_age_hours: float = 24.0
    daily_cap_per_channel: int = 2


def default_rules_for(video_type: str, watchlist_id: str) -> AlertRule:
    if video_type == "short":
        return AlertRule(
            watchlist_id=watchlist_id,
            video_type="short",
            multiplier=3.0,
            abs_floor_vph=10000.0,
            min_age_minutes=15,
            max_age_hours=12.0,
        )
    return AlertRule(watchlist_id=watchlist_id, video_type="long")


def should_trigger_velocity_spike(
    *,
    video_age_minutes: float,
    video_age_hours: float,
    vph: float,
    baseline_vph: float,
    rule: AlertRule,
) -> bool:
    if video_age_minutes < rule.min_age_minutes:
        return False
    if video_age_hours > rule.max_age_hours:
        return False
    if vph < rule.abs_floor_vph:
        return False
    if baseline_vph <= 0:
        return False
    if vph < (rule.multiplier * baseline_vph):
        return False
    return True

