import hashlib
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator, Optional, Sequence

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


@contextmanager
def connect(database_url: str) -> Iterator[psycopg2.extensions.connection]:
    conn = psycopg2.connect(database_url)
    try:
        yield conn
    finally:
        conn.close()


def _migration_version(path: Path) -> str:
    content = path.read_bytes()
    h = hashlib.sha256(content).hexdigest()[:16]
    return f"{path.name}:{h}"


def apply_sql_migrations(*, database_url: str, migrations_dir: str) -> list[str]:
    mig_dir = Path(migrations_dir)
    if not mig_dir.exists():
        raise FileNotFoundError(f"migrations_dir not found: {migrations_dir}")

    sql_files = sorted([p for p in mig_dir.glob("*.sql") if p.is_file()])
    applied: list[str] = []
    if not sql_files:
        return applied

    with connect(database_url) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
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


def fetchall_dict(cur) -> list[dict]:
    rows = cur.fetchall()
    return [dict(r) for r in rows]

