import re


_DUR_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def parse_youtube_duration_to_seconds(duration: str) -> int:
    """
    Parse ISO-8601 duration strings returned by YouTube (e.g. PT15S, PT1M2S, PT1H3M).
    Returns total seconds.
    """
    if not duration or not isinstance(duration, str):
        raise ValueError("duration must be a non-empty string")

    m = _DUR_RE.match(duration)
    if not m:
        raise ValueError(f"invalid ISO-8601 duration: {duration!r}")

    days = int(m.group("days") or 0)
    hours = int(m.group("hours") or 0)
    minutes = int(m.group("minutes") or 0)
    seconds = int(m.group("seconds") or 0)

    total = (((days * 24) + hours) * 60 + minutes) * 60 + seconds
    return total


def classify_video_type(duration_seconds: int) -> str:
    if duration_seconds <= 60:
        return "short"
    return "long"

