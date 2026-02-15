import hashlib
import logging
import os
from pathlib import Path
from typing import List

from airflow.providers.postgres.hooks.postgres import PostgresHook

logger = logging.getLogger(__name__)


def _migration_version(path: Path) -> str:
    # Use filename + content hash to prevent silent edits to already-applied migrations.
    content = path.read_bytes()
    h = hashlib.sha256(content).hexdigest()[:16]
    return f"{path.name}:{h}"


def apply_sql_migrations(*, postgres_conn_id: str, migrations_dir: str) -> List[str]:
    """
    Applies *.sql migrations in sorted order, recording each applied migration in core.schema_migrations.
    Returns a list of applied migration versions.
    """
    hook = PostgresHook(postgres_conn_id=postgres_conn_id)
    applied: List[str] = []

    mig_dir = Path(migrations_dir)
    if not mig_dir.exists():
        raise FileNotFoundError(f"migrations_dir not found: {migrations_dir}")

    sql_files = sorted([p for p in mig_dir.glob("*.sql") if p.is_file()])
    if not sql_files:
        logger.warning("No SQL migrations found in %s", migrations_dir)
        return applied

    with hook.get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            # Ensure schemas table exists early (migration 001 creates it, but this makes re-runs safe).
            cur.execute("CREATE SCHEMA IF NOT EXISTS core;")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS core.schema_migrations (
                  version text PRIMARY KEY,
                  applied_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )

            for path in sql_files:
                version = _migration_version(path)
                cur.execute("SELECT 1 FROM core.schema_migrations WHERE version = %s;", (version,))
                if cur.fetchone():
                    continue

                sql = path.read_text(encoding="utf-8")
                logger.info("Applying migration %s", version)
                cur.execute(sql)
                cur.execute("INSERT INTO core.schema_migrations(version) VALUES (%s);", (version,))
                applied.append(version)

    return applied


def migrations_dir_default() -> str:
    # In docker-compose we mount ./migrations -> /opt/airflow/migrations
    return os.getenv("MIGRATIONS_DIR", "/opt/airflow/migrations")

