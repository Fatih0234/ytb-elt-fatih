import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

import pendulum
import yaml

from airflow import DAG
from airflow.decorators import task

from airflow.providers.postgres.hooks.postgres import PostgresHook

from ytb_elt.db.migrate import apply_sql_migrations, migrations_dir_default

logger = logging.getLogger(__name__)

LOCAL_TZ = pendulum.timezone("UTC")
POSTGRES_CONN_ID = "postgres_db_yt_elt"

DEFAULT_WATCHLIST_ID = "default"
WATCHLISTS_PATH = os.getenv("WATCHLISTS_CONFIG_PATH", "/opt/airflow/config/watchlists.yml")


def _pg() -> PostgresHook:
    return PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)


def _load_channel_ids_from_yaml(path: str) -> List[str]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"watchlists config not found: {path}")
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    watchlists = data.get("watchlists") or []
    out: List[str] = []
    for wl in watchlists:
        for c in (wl.get("channels") or []):
            cid = c.get("channel_id")
            if cid:
                out.append(cid)
    # stable order
    return sorted(set(out))


@task
def migrate_db() -> List[str]:
    return apply_sql_migrations(postgres_conn_id=POSTGRES_CONN_ID, migrations_dir=migrations_dir_default())


@task
def bootstrap_watchlists_from_yaml() -> int:
    """
    Manual/dev-only bootstrap:
    - Ensures core.watchlists has the "default" watchlist
    - Inserts stub core.channels rows for YAML channel_ids (so FK constraints pass)
    - Inserts core.watchlist_channels mappings (ON CONFLICT DO NOTHING)

    This never deletes existing DB rows.
    """
    channel_ids = _load_channel_ids_from_yaml(WATCHLISTS_PATH)
    if not channel_ids:
        logger.info("No channel_ids found in %s", WATCHLISTS_PATH)
        return 0

    inserted = 0
    with _pg().get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO core.watchlists(watchlist_id, enabled, video_types, updated_at)
                VALUES (%s, true, ARRAY['long','short'], now())
                ON CONFLICT (watchlist_id) DO UPDATE
                  SET enabled = true,
                      updated_at = now();
                """,
                (DEFAULT_WATCHLIST_ID,),
            )

            # Ensure channels exist (stub rows are OK; ingest will fill metadata).
            for channel_id in channel_ids:
                cur.execute(
                    """
                    INSERT INTO core.channels(channel_id, updated_at)
                    VALUES (%s, now())
                    ON CONFLICT (channel_id) DO NOTHING;
                    """,
                    (channel_id,),
                )

                cur.execute(
                    """
                    INSERT INTO core.watchlist_channels(watchlist_id, channel_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING;
                    """,
                    (DEFAULT_WATCHLIST_ID, channel_id),
                )
                if cur.rowcount == 1:
                    inserted += 1

    return inserted


default_args = {
    "owner": "dataengineers",
    "depends_on_past": False,
    "retries": 0,
    "max_active_runs": 1,
    "dagrun_timeout": timedelta(minutes=10),
    "start_date": datetime(2026, 1, 1, tzinfo=LOCAL_TZ),
}


with DAG(
    dag_id="bootstrap_watchlists_from_yaml",
    default_args=default_args,
    schedule=None,  # manual only
    catchup=False,
    description="Manual/dev-only: import channel_ids from config/watchlists.yml into DB without deleting anything",
) as dag:
    t_mig = migrate_db()
    t_bootstrap = bootstrap_watchlists_from_yaml()
    t_mig >> t_bootstrap

