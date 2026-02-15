import logging
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple

import pendulum

from airflow import DAG
from airflow.decorators import task
from airflow.models import Variable
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

from ytb_elt.db.migrate import apply_sql_migrations, migrations_dir_default
from ytb_elt.logic.duration import classify_video_type, parse_youtube_duration_to_seconds
from ytb_elt.youtube.client import YouTubeClient, batch

from airflow.providers.postgres.hooks.postgres import PostgresHook

logger = logging.getLogger(__name__)

LOCAL_TZ = pendulum.timezone("UTC")

POSTGRES_CONN_ID = "postgres_db_yt_elt"


def _pg() -> PostgresHook:
    return PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)


@task
def migrate_db() -> List[str]:
    return apply_sql_migrations(postgres_conn_id=POSTGRES_CONN_ID, migrations_dir=migrations_dir_default())


@task
def get_tracked_channels_from_db() -> Dict[str, List[str]]:
    """
    Source of truth for tracked channels is Postgres (core.watchlist_channels).
    Returns mapping: watchlist_id -> channel_ids.
    """
    out: Dict[str, List[str]] = {}
    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT w.watchlist_id, wc.channel_id
                FROM core.watchlists w
                JOIN core.watchlist_channels wc ON wc.watchlist_id = w.watchlist_id
                WHERE w.enabled = true
                ORDER BY w.watchlist_id, wc.channel_id;
                """
            )
            rows = cur.fetchall()
            for watchlist_id, channel_id in rows:
                out.setdefault(watchlist_id, []).append(channel_id)
    return out


@task
def upsert_channels_and_uploads_playlist_ids(watchlist_channels: Dict[str, List[str]]) -> List[str]:
    channel_ids: Set[str] = set()
    for ids in watchlist_channels.values():
        channel_ids.update(ids)

    if not channel_ids:
        logger.info("No channels configured")
        return []

    api_key = Variable.get("YOUTUBE_API_KEY")
    yt = YouTubeClient(api_key)

    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for channel_id in sorted(channel_ids):
                title, uploads = yt.get_channel_uploads_playlist(channel_id)
                if not uploads:
                    logger.warning("No uploads playlist found for channel_id=%s", channel_id)
                    continue
                cur.execute(
                    """
                    INSERT INTO core.channels(channel_id, title, uploads_playlist_id, updated_at)
                    VALUES (%s, %s, %s, now())
                    ON CONFLICT (channel_id) DO UPDATE
                      SET title = EXCLUDED.title,
                          uploads_playlist_id = EXCLUDED.uploads_playlist_id,
                          updated_at = now();
                    """,
                    (channel_id, title, uploads),
                )

    return sorted(channel_ids)


@task
def fetch_recent_video_ids_per_channel(channel_ids: List[str], limit_per_channel: int = 200) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    if not channel_ids:
        return out

    api_key = Variable.get("YOUTUBE_API_KEY")
    yt = YouTubeClient(api_key)

    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for channel_id in channel_ids:
                cur.execute("SELECT uploads_playlist_id FROM core.channels WHERE channel_id=%s;", (channel_id,))
                row = cur.fetchone()
                uploads = row[0] if row else None
                if not uploads:
                    logger.warning("Missing uploads_playlist_id for channel_id=%s", channel_id)
                    continue
                vids = yt.list_recent_upload_video_ids(uploads, limit=limit_per_channel)
                out[channel_id] = [v for (v, _published_at) in vids]

    return out


@task
def upsert_videos_and_insert_snapshots(recent_video_ids: Dict[str, List[str]]) -> int:
    # Dedupe all IDs across channels (videos are channel-scoped, but keep safe).
    to_fetch: List[Tuple[str, str]] = []
    for channel_id, vids in recent_video_ids.items():
        for vid in vids:
            to_fetch.append((channel_id, vid))

    if not to_fetch:
        logger.info("No videos to fetch")
        return 0

    api_key = Variable.get("YOUTUBE_API_KEY")
    yt = YouTubeClient(api_key)

    pulled_at = datetime.now(tz=LOCAL_TZ)
    # Round to minute for dedupe.
    pulled_at = pulled_at.replace(second=0, microsecond=0)

    inserted_snapshots = 0

    # Process per channel to keep video->channel mapping simple.
    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for channel_id, vids in recent_video_ids.items():
                if not vids:
                    continue
                for ids in batch(vids, 50):
                    items = yt.get_videos(ids)
                    for item in items:
                        video_id = item.get("id")
                        snippet = item.get("snippet") or {}
                        content = item.get("contentDetails") or {}
                        stats = item.get("statistics") or {}

                        title = snippet.get("title") or ""
                        published_at = snippet.get("publishedAt")
                        duration = content.get("duration")
                        if not (video_id and published_at and duration and title):
                            continue

                        duration_seconds = parse_youtube_duration_to_seconds(duration)
                        video_type = classify_video_type(duration_seconds)

                        view_count = stats.get("viewCount")
                        like_count = stats.get("likeCount")
                        comment_count = stats.get("commentCount")

                        cur.execute(
                            """
                            INSERT INTO core.videos(video_id, channel_id, title, published_at, duration_seconds, video_type, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, now())
                            ON CONFLICT (video_id) DO UPDATE
                              SET title = EXCLUDED.title,
                                  channel_id = EXCLUDED.channel_id,
                                  published_at = EXCLUDED.published_at,
                                  duration_seconds = EXCLUDED.duration_seconds,
                                  video_type = EXCLUDED.video_type,
                                  updated_at = now();
                            """,
                            (video_id, channel_id, title, published_at, duration_seconds, video_type),
                        )

                        cur.execute(
                            """
                            INSERT INTO core.video_stats_snapshots(video_id, pulled_at, view_count, like_count, comment_count)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (video_id, pulled_at) DO NOTHING;
                            """,
                            (
                                video_id,
                                pulled_at,
                                int(view_count) if view_count is not None else None,
                                int(like_count) if like_count is not None else None,
                                int(comment_count) if comment_count is not None else None,
                            ),
                        )
                        if cur.rowcount == 1:
                            inserted_snapshots += 1

    return inserted_snapshots


default_args = {
    "owner": "dataengineers",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=2),
    "max_active_runs": 1,
    "dagrun_timeout": timedelta(minutes=10),
    "start_date": datetime(2026, 1, 1, tzinfo=LOCAL_TZ),
}


with DAG(
    dag_id="ingest_youtube_watchlists",
    default_args=default_args,
    schedule="*/15 * * * *",
    catchup=False,
    description="Ingest YouTube channels from DB watchlists into core tables + stats snapshots",
) as dag:
    t_mig = migrate_db()
    t_tracked = get_tracked_channels_from_db()
    t_channels = upsert_channels_and_uploads_playlist_ids(t_tracked)
    t_recent = fetch_recent_video_ids_per_channel(t_channels)
    t_snap = upsert_videos_and_insert_snapshots(t_recent)

    t_trigger_alerts = TriggerDagRunOperator(
        task_id="trigger_compute_and_send_alerts",
        trigger_dag_id="compute_and_send_alerts",
        wait_for_completion=False,
    )

    t_mig >> t_tracked >> t_channels >> t_recent >> t_snap >> t_trigger_alerts
