def compute_views_per_hour(delta_views: int, delta_seconds: float) -> float:
    if delta_seconds <= 0:
        raise ValueError("delta_seconds must be > 0")
    return float(delta_views) / (float(delta_seconds) / 3600.0)

