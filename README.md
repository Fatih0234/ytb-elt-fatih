# YouTube ELT + Alerts (Airflow + Postgres) + MVP Channel Tracker App (No Auth)

This repo runs a local data pipeline that:

- Lets you add/remove tracked YouTube channels via a tiny web app (no login)
- Ingests channel videos + stats snapshots into Postgres every 15 minutes (Airflow)
- Computes simple velocity-spike alerts and posts them to Discord (deduped)

There is no web app auth, no multi-tenant support, and no UI for editing Slack webhooks.

## Architecture

Services (Docker Compose):

- `postgres`: one Postgres instance hosting multiple databases
  - `airflow_meta`: Airflow metadata DB
  - `airflow_celery`: Celery result backend DB
  - `elt_db`: the ELT DB where `staging`/`core` schemas live
- `redis`: Celery broker
- `airflow-webserver`, `airflow-scheduler`, `airflow-worker`: Airflow stack
- `app`: FastAPI + server-rendered HTML + HTMX (channel search + tracklist)

Source of truth for tracked channels:

- `core.watchlist_channels` in Postgres
- The app writes to it
- The ingestion DAG reads from it

## Prerequisites

- Docker Desktop
- A YouTube Data API v3 key
- (Optional) A Discord Incoming Webhook URL

## Configure env

Copy `.env.example` to `.env` and set at least:

- `YOUTUBE_API_KEY=...`
- `DISCORD_WEBHOOK_URL=...` (optional; alerts will fail to post if missing)

Notes:

- Docker Compose automatically reads `.env` in this folder.
- Default ports:
  - Airflow UI: `http://localhost:8080`
  - App UI: `http://localhost:8001`

## Run locally

Start everything:

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Open:

- Airflow UI: `http://localhost:8080`
- Web app: `http://localhost:8001`

## Use the web app

1. Open `http://localhost:8001`
2. Search for a channel using:
   - Channel ID: `UC...`
   - Channel URL: `https://www.youtube.com/channel/UC...`
   - Handle: `@somehandle` or `https://www.youtube.com/@somehandle`
   - Name query: `MrBeast` (uses `search.list` interactively)
3. Click `Add` to track it.

This will upsert `core.channels` and insert a row into `core.watchlist_channels` for the single watchlist:

- `watchlist_id = 'default'`

## Airflow DAGs

Key DAGs:

- `ingest_youtube_watchlists` (schedule: every 15 minutes)
  - Reads tracked channels from `core.watchlist_channels`
  - Upserts `core.channels` / `core.videos`
  - Inserts `core.video_stats_snapshots`
  - Triggers `compute_and_send_alerts`

- `compute_and_send_alerts` (triggered after ingestion)
  - Computes a simple views/hour spike from the last two snapshots
  - Posts Discord alerts
  - Dedupes via `core.alerts_sent`

Manual bootstrap DAG (dev convenience):

- `bootstrap_watchlists_from_yaml`
  - Imports `config/watchlists.yml` into DB WITHOUT deleting anything

Legacy DAGs from the original repo still exist:

- `produce_json`, `update_db`, `data_quality`

## Where is the data?

All product data lives in the ELT database `elt_db` in schema `core`.

Useful queries:

```sql
-- tracked channels
select * from core.watchlist_channels where watchlist_id = 'default';

-- channels
select * from core.channels order by updated_at desc;

-- videos
select channel_id, count(*) from core.videos group by 1 order by 2 desc;

-- stats snapshots
select count(*) from core.video_stats_snapshots;

-- recent alerts
select * from core.alerts_sent order by sent_at desc limit 20;
```

Connect to Postgres from your host:

```bash
psql postgresql://elt_user:elt_pass@localhost:5432/elt_db
```

## Tests

Run tests inside the Airflow worker container:

```bash
docker compose exec -T -w /opt/airflow airflow-worker pytest -q
```

## Dev: Force An Alert (Lower Thresholds)

By default, long-form alerts require at least **5000 views/hour**, so smaller channels will never trigger.

To prove the end-to-end path works (DAG decides -> writes `core.alerts_sent` -> posts to Discord), you can temporarily lower thresholds via Airflow Variables:

```bash
docker compose exec -T airflow-worker airflow variables set ALERTS_LONG_ABS_FLOOR_VPH 50
docker compose exec -T airflow-worker airflow variables set ALERTS_LONG_MULTIPLIER 1.1
docker compose exec -T airflow-worker airflow variables set ALERTS_LONG_MIN_AGE_MINUTES 0
docker compose exec -T airflow-worker airflow variables set ALERTS_LONG_MAX_AGE_HOURS 9999
```

Then run ingestion twice (to ensure each video has 2 snapshots) and check alerts:

```bash
docker compose exec -T airflow-worker airflow dags trigger ingest_youtube_watchlists
sleep 70
docker compose exec -T airflow-worker airflow dags trigger ingest_youtube_watchlists

docker compose exec -T postgres bash -lc "PGPASSWORD=elt_pass psql -U elt_user -d elt_db -c \
\"select sent_at, channel_id, video_id, rule_type from core.alerts_sent order by sent_at desc limit 20;\""
```

Reset by deleting variables or setting them back to the defaults (long: floor=5000, multiplier=2.5, min_age=30, max_age=24).

## Migrations

SQL migrations live in `migrations/`.

- Airflow DAGs run migrations via a lightweight migration runner (`core.schema_migrations`).
- The web app also applies migrations on startup.
