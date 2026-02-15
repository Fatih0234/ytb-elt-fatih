import logging
from dataclasses import dataclass
from dataclasses import replace as dc_replace
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Dict, List, Optional, Tuple

import pendulum
from airflow import DAG
from airflow.decorators import task
from airflow.models import Variable
from airflow.providers.postgres.hooks.postgres import PostgresHook

from ytb_elt.db.migrate import apply_sql_migrations, migrations_dir_default
from ytb_elt.logic.alerts import default_rules_for, should_trigger_velocity_spike
from ytb_elt.logic.metrics import compute_views_per_hour
from ytb_elt.notify.discord import send_discord_webhook

logger = logging.getLogger(__name__)

LOCAL_TZ = pendulum.timezone("UTC")
POSTGRES_CONN_ID = "postgres_db_yt_elt"


@dataclass(frozen=True)
class Candidate:
    watchlist_id: str
    discord_webhook_url: str
    channel_id: str
    channel_title: str
    video_id: str
    video_title: str
    published_at: datetime
    video_type: str
    views_now: int
    vph: float
    baseline_vph: float


def _pg() -> PostgresHook:
    return PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)


def _video_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _var_float(name: str) -> Optional[float]:
    raw = Variable.get(name, default_var="")
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except Exception:
        logger.warning("Invalid float Airflow Variable %s=%r (ignored)", name, raw)
        return None


def _var_int(name: str) -> Optional[int]:
    raw = Variable.get(name, default_var="")
    if raw in (None, ""):
        return None
    try:
        return int(float(raw))
    except Exception:
        logger.warning("Invalid int Airflow Variable %s=%r (ignored)", name, raw)
        return None


def _rule_with_overrides(watchlist_id: str, video_type: str):
    """
    Allow dev/prod tuning via Airflow Variables, e.g.:
      ALERTS_LONG_ABS_FLOOR_VPH=100
      ALERTS_LONG_MULTIPLIER=1.2
      ALERTS_LONG_MIN_AGE_MINUTES=0
      ALERTS_LONG_MAX_AGE_HOURS=9999
    (short variants use ALERTS_SHORT_*)
    """
    rule = default_rules_for(video_type, watchlist_id)
    prefix = "ALERTS_SHORT_" if video_type == "short" else "ALERTS_LONG_"

    abs_floor_vph = _var_float(prefix + "ABS_FLOOR_VPH")
    multiplier = _var_float(prefix + "MULTIPLIER")
    min_age_minutes = _var_int(prefix + "MIN_AGE_MINUTES")
    max_age_hours = _var_float(prefix + "MAX_AGE_HOURS")

    # Keep the override surface small for now.
    if abs_floor_vph is not None:
        rule = dc_replace(rule, abs_floor_vph=abs_floor_vph)
    if multiplier is not None:
        rule = dc_replace(rule, multiplier=multiplier)
    if min_age_minutes is not None:
        rule = dc_replace(rule, min_age_minutes=min_age_minutes)
    if max_age_hours is not None:
        rule = dc_replace(rule, max_age_hours=max_age_hours)

    return rule


@task
def compute_and_send_alerts() -> int:
    """
    Compute velocity spikes from the last two snapshots per video and send Discord alerts.
    Returns number of alerts sent (deduped by core.alerts_sent).
    """
    # Ensure migrations applied so optional columns exist (e.g. discord_webhook_url).
    apply_sql_migrations(postgres_conn_id=POSTGRES_CONN_ID, migrations_dir=migrations_dir_default())

    default_webhook = Variable.get("DISCORD_WEBHOOK_URL", default_var="")
    now = datetime.now(timezone.utc)

    sent = 0

    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT watchlist_id, COALESCE(discord_webhook_url, ''), enabled, video_types
                FROM core.watchlists
                WHERE enabled = true;
                """
            )
            watchlists = cur.fetchall()

            for watchlist_id, wl_webhook, _enabled, video_types in watchlists:
                webhook = wl_webhook or default_webhook
                if not webhook:
                    logger.warning("No Discord webhook configured for watchlist_id=%s (skipping)", watchlist_id)
                    continue

                cur.execute(
                    """
                    SELECT wc.channel_id, COALESCE(c.title, '')
                    FROM core.watchlist_channels wc
                    JOIN core.channels c ON c.channel_id = wc.channel_id
                    WHERE wc.watchlist_id = %s
                    ORDER BY wc.channel_id;
                    """,
                    (watchlist_id,),
                )
                channels = cur.fetchall()

                for channel_id, channel_title in channels:
                    for video_type in (video_types or []):
                        rule = _rule_with_overrides(watchlist_id, video_type)

                        # Daily cap per watchlist+channel.
                        cur.execute(
                            """
                            SELECT count(*)
                            FROM core.alerts_sent
                            WHERE watchlist_id=%s AND channel_id=%s AND sent_at >= date_trunc('day', now());
                            """,
                            (watchlist_id, channel_id),
                        )
                        already_today = int(cur.fetchone()[0])
                        if already_today >= rule.daily_cap_per_channel:
                            continue

                        # Fetch candidate videos in age window.
                        cur.execute(
                            """
                            SELECT v.video_id, v.title, v.published_at
                            FROM core.videos v
                            WHERE v.channel_id=%s
                              AND v.video_type=%s
                              AND v.published_at >= (now() - (%s || ' hours')::interval)
                            ORDER BY v.published_at DESC;
                            """,
                            (channel_id, video_type, rule.max_age_hours),
                        )
                        vids = cur.fetchall()
                        if not vids:
                            continue

                        logger.info(
                            "Alerts scan: watchlist_id=%s channel_id=%s video_type=%s videos_in_window=%d rule(abs_floor_vph=%s multiplier=%s min_age_minutes=%s max_age_hours=%s)",
                            watchlist_id,
                            channel_id,
                            video_type,
                            len(vids),
                            rule.abs_floor_vph,
                            rule.multiplier,
                            rule.min_age_minutes,
                            rule.max_age_hours,
                        )

                        # Baseline: median VPH among "early" videos (<= baseline_hours), using current VPH per video.
                        baseline_samples: List[float] = []
                        for video_id, _title, published_at in vids[: rule.baseline_window_videos]:
                            age_hours = (now - published_at).total_seconds() / 3600.0
                            if age_hours > rule.baseline_hours:
                                continue
                            vph = _latest_vph(cur, video_id)
                            if vph is not None and vph >= 0:
                                baseline_samples.append(vph)
                        baseline_vph = median(baseline_samples) if baseline_samples else (1000.0 if video_type == "long" else 2000.0)

                        for video_id, video_title, published_at in vids:
                            age_minutes = (now - published_at).total_seconds() / 60.0
                            age_hours = age_minutes / 60.0
                            vph = _latest_vph(cur, video_id)
                            if vph is None:
                                continue

                            # Current views from newest snapshot.
                            cur.execute(
                                """
                                SELECT view_count
                                FROM core.video_stats_snapshots
                                WHERE video_id=%s
                                ORDER BY pulled_at DESC
                                LIMIT 1;
                                """,
                                (video_id,),
                            )
                            views_now = cur.fetchone()[0] or 0

                            if not should_trigger_velocity_spike(
                                video_age_minutes=age_minutes,
                                video_age_hours=age_hours,
                                vph=vph,
                                baseline_vph=baseline_vph,
                                rule=rule,
                            ):
                                continue

                            # Dedup at DB level.
                            cur.execute(
                                """
                                INSERT INTO core.alerts_sent(watchlist_id, channel_id, video_id, rule_type, sent_at)
                                VALUES (%s, %s, %s, %s, now())
                                ON CONFLICT (watchlist_id, video_id, rule_type) DO NOTHING;
                                """,
                                (watchlist_id, channel_id, video_id, "velocity_spike"),
                            )
                            if cur.rowcount != 1:
                                continue

                            text = f"[Spike] {channel_title}: {video_title}"
                            body = (
                                f"*{text}*\n"
                                f"Video: {_video_url(video_id)}\n"
                                f"Type: {video_type}\n"
                                f"Published: {published_at.isoformat()}\n"
                                f"Views: {views_now:,}\n"
                                f"Views/hour (est): {vph:,.0f}\n"
                                f"Baseline: {baseline_vph:,.0f} (x{rule.multiplier})\n"
                            )
                            send_discord_webhook(webhook_url=webhook, content=body)
                            sent += 1

    return sent


def _latest_vph(cur, video_id: str) -> Optional[float]:
    cur.execute(
        """
        SELECT pulled_at, view_count
        FROM core.video_stats_snapshots
        WHERE video_id=%s AND view_count IS NOT NULL
        ORDER BY pulled_at DESC
        LIMIT 2;
        """,
        (video_id,),
    )
    rows = cur.fetchall()
    if len(rows) < 2:
        return None
    (t1, v1), (t0, v0) = rows[0], rows[1]
    delta_views = int(v1) - int(v0)
    delta_seconds = (t1 - t0).total_seconds()
    if delta_views < 0:
        return None
    try:
        return compute_views_per_hour(delta_views, delta_seconds)
    except ValueError:
        return None


default_args = {
    "owner": "dataengineers",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
    "max_active_runs": 1,
    "dagrun_timeout": timedelta(minutes=10),
    "start_date": datetime(2026, 1, 1, tzinfo=LOCAL_TZ),
}


with DAG(
    dag_id="compute_and_send_alerts",
    default_args=default_args,
    schedule=None,  # triggered by ingest DAG
    catchup=False,
    description="Compute velocity spike alerts from snapshots and send Discord notifications",
) as dag:
    compute_and_send_alerts()
