import logging
import time
from typing import Any

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from psycopg2.extras import RealDictCursor

from app import db, settings, youtube

logger = logging.getLogger(__name__)

app = FastAPI()
templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

DEFAULT_WATCHLIST_ID = "default"

# Very small in-memory throttle: ip -> last_search_epoch
_last_search_by_ip: dict[str, float] = {}
_SEARCH_COOLDOWN_S = 1.0


@app.on_event("startup")
def _startup() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # Make app usable even before Airflow ever ran.
    applied = db.apply_sql_migrations(database_url=settings.database_url(), migrations_dir=settings.migrations_dir())
    if applied:
        logger.info("Applied %d migrations", len(applied))
    _ensure_default_watchlist()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> Any:
    tracked = _get_tracked_channels()
    alerts = _get_recent_alerts()
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "tracked": tracked,
            "alerts": alerts,
        },
    )


@app.get("/search", response_class=HTMLResponse)
def search(request: Request, q: str = "") -> Any:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    last = _last_search_by_ip.get(ip, 0.0)
    if now - last < _SEARCH_COOLDOWN_S:
        raise HTTPException(status_code=429, detail="slow down")
    _last_search_by_ip[ip] = now

    q = (q or "").strip()
    if not q:
        return templates.TemplateResponse("partials/search_results.html", {"request": request, "results": [], "q": q})

    api_key = settings.youtube_api_key()
    if not api_key:
        return templates.TemplateResponse(
            "partials/search_results.html",
            {"request": request, "results": [], "q": q, "error": "Missing YOUTUBE_API_KEY in environment"},
        )

    yt = youtube.YouTubeClient(api_key)
    parsed = youtube.parse_channel_input(q)

    results: list[youtube.ChannelResult] = []
    error = None

    try:
        if "channel_id" in parsed:
            item = yt.resolve_channel_by_id(parsed["channel_id"])
            if item:
                r = youtube.channel_result_from_channels_item(item)
                if r:
                    results = [r]
        elif "handle" in parsed:
            item = yt.resolve_channel_by_handle(parsed["handle"])
            if item:
                r = youtube.channel_result_from_channels_item(item)
                if r:
                    results = [r]
        else:
            items = yt.search_channels(parsed.get("query", q), limit=10)
            for it in items:
                # search.list item structure differs: id.channelId + snippet
                r = youtube.channel_result_from_channels_item(it)
                if r:
                    results.append(r)
    except Exception as e:
        error = str(e)

    return templates.TemplateResponse(
        "partials/search_results.html",
        {"request": request, "results": results, "q": q, "error": error},
    )


@app.post("/track", response_class=HTMLResponse)
def track(request: Request, channel_id: str = Form(...)) -> Any:
    api_key = settings.youtube_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Missing YOUTUBE_API_KEY")

    yt = youtube.YouTubeClient(api_key)
    item = yt.resolve_channel_by_id(channel_id)
    if not item:
        raise HTTPException(status_code=404, detail="Channel not found")

    r = youtube.channel_result_from_channels_item(item)
    uploads = youtube.uploads_playlist_id_from_channels_item(item)
    if not r or not uploads:
        raise HTTPException(status_code=400, detail="Channel missing required metadata")

    with db.connect(settings.database_url()) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            _ensure_default_watchlist(cur=cur)
            cur.execute(
                """
                INSERT INTO core.channels(channel_id, title, uploads_playlist_id, handle, thumbnail_url, last_resolved_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, now(), now())
                ON CONFLICT (channel_id) DO UPDATE
                  SET title = EXCLUDED.title,
                      uploads_playlist_id = EXCLUDED.uploads_playlist_id,
                      handle = EXCLUDED.handle,
                      thumbnail_url = EXCLUDED.thumbnail_url,
                      last_resolved_at = now(),
                      updated_at = now();
                """,
                (r.channel_id, r.title, uploads, r.handle, r.thumbnail_url),
            )

            cur.execute(
                """
                INSERT INTO core.watchlist_channels(watchlist_id, channel_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING;
                """,
                (DEFAULT_WATCHLIST_ID, r.channel_id),
            )

    tracked = _get_tracked_channels()
    return templates.TemplateResponse("partials/tracked_list.html", {"request": request, "tracked": tracked})


@app.post("/untrack", response_class=HTMLResponse)
def untrack(request: Request, channel_id: str = Form(...)) -> Any:
    with db.connect(settings.database_url()) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM core.watchlist_channels WHERE watchlist_id=%s AND channel_id=%s;",
                (DEFAULT_WATCHLIST_ID, channel_id),
            )
    tracked = _get_tracked_channels()
    return templates.TemplateResponse("partials/tracked_list.html", {"request": request, "tracked": tracked})


def _ensure_default_watchlist(cur=None) -> None:
    if cur is None:
        with db.connect(settings.database_url()) as conn:
            conn.autocommit = True
            with conn.cursor() as cur2:
                _ensure_default_watchlist(cur=cur2)
        return

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


def _get_tracked_channels() -> list[dict]:
    with db.connect(settings.database_url()) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                  c.channel_id,
                  COALESCE(c.title, '') AS title,
                  COALESCE(c.thumbnail_url, '') AS thumbnail_url,
                  max(s.pulled_at) AS last_snapshot_at,
                  count(distinct v.video_id) AS videos_count
                FROM core.watchlist_channels wc
                JOIN core.channels c ON c.channel_id = wc.channel_id
                LEFT JOIN core.videos v ON v.channel_id = c.channel_id
                LEFT JOIN core.video_stats_snapshots s ON s.video_id = v.video_id
                WHERE wc.watchlist_id = %s
                GROUP BY c.channel_id, c.title, c.thumbnail_url
                ORDER BY COALESCE(c.title, c.channel_id);
                """,
                (DEFAULT_WATCHLIST_ID,),
            )
            return [dict(r) for r in cur.fetchall()]


def _get_recent_alerts(limit: int = 20) -> list[dict]:
    with db.connect(settings.database_url()) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                  a.sent_at,
                  a.rule_type,
                  a.channel_id,
                  COALESCE(c.title, '') AS channel_title,
                  a.video_id,
                  COALESCE(v.title, '') AS video_title
                FROM core.alerts_sent a
                LEFT JOIN core.channels c ON c.channel_id = a.channel_id
                LEFT JOIN core.videos v ON v.video_id = a.video_id
                ORDER BY a.sent_at DESC
                LIMIT %s;
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
