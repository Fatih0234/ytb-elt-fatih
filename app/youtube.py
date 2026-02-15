import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)


_CHANNEL_ID_RE = re.compile(r"^(UC[a-zA-Z0-9_-]{20,})$")
_CHANNEL_URL_RE = re.compile(r"/channel/(UC[a-zA-Z0-9_-]{20,})")
_HANDLE_RE = re.compile(r"(?:^|/|\\s)@([A-Za-z0-9_.-]{3,})")


@dataclass(frozen=True)
class ChannelResult:
    channel_id: str
    title: str
    thumbnail_url: str
    handle: Optional[str] = None


def parse_channel_input(raw: str) -> dict[str, str]:
    """
    Returns a dict with one of:
      {"channel_id": "..."} or {"handle": "..."} or {"query": "..."}
    """
    if not raw or not raw.strip():
        return {"query": ""}

    s = raw.strip()

    m = _CHANNEL_URL_RE.search(s)
    if m:
        return {"channel_id": m.group(1)}

    m = _CHANNEL_ID_RE.match(s)
    if m:
        return {"channel_id": m.group(1)}

    m = _HANDLE_RE.search(s)
    if m:
        return {"handle": m.group(1)}

    return {"query": s}


class YouTubeClient:
    def __init__(self, api_key: str, *, timeout: int = 20):
        self.api_key = api_key
        self.timeout = timeout

    def _get(self, url: str, *, retries: int = 3, backoff_s: float = 0.8) -> dict[str, Any]:
        last_exc = None
        for attempt in range(1, retries + 1):
            try:
                resp = requests.get(url, timeout=self.timeout)
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"retryable status {resp.status_code}: {resp.text[:300]}")
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                last_exc = e
                sleep_s = backoff_s * (2 ** (attempt - 1))
                time.sleep(sleep_s)
        raise last_exc  # type: ignore[misc]

    def resolve_channel_by_id(self, channel_id: str) -> Optional[dict[str, Any]]:
        url = (
            "https://youtube.googleapis.com/youtube/v3/channels"
            f"?part=contentDetails&part=snippet&id={channel_id}&key={self.api_key}"
        )
        data = self._get(url)
        items = data.get("items") or []
        return items[0] if items else None

    def resolve_channel_by_handle(self, handle: str) -> Optional[dict[str, Any]]:
        url = (
            "https://youtube.googleapis.com/youtube/v3/channels"
            f"?part=contentDetails&part=snippet&forHandle={handle}&key={self.api_key}"
        )
        data = self._get(url)
        items = data.get("items") or []
        return items[0] if items else None

    def search_channels(self, query: str, *, limit: int = 10) -> list[dict[str, Any]]:
        params = {
            "part": "snippet",
            "type": "channel",
            "maxResults": str(limit),
            "q": query,
            "key": self.api_key,
        }
        resp = requests.get("https://youtube.googleapis.com/youtube/v3/search", params=params, timeout=self.timeout)
        if resp.status_code in (429, 500, 502, 503, 504):
            raise requests.HTTPError(f"retryable status {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()
        data = resp.json()
        return data.get("items") or []


def channel_result_from_channels_item(item: dict[str, Any]) -> Optional[ChannelResult]:
    snippet = item.get("snippet") or {}
    channel_id = item.get("id")
    if isinstance(channel_id, dict):
        channel_id = (channel_id.get("channelId") if channel_id else None)

    title = snippet.get("title") or ""
    thumbs = snippet.get("thumbnails") or {}
    thumb = (
        (thumbs.get("high") or {}).get("url")
        or (thumbs.get("medium") or {}).get("url")
        or (thumbs.get("default") or {}).get("url")
        or ""
    )

    if not (channel_id and title):
        return None

    handle = snippet.get("customUrl") or None
    return ChannelResult(channel_id=channel_id, title=title, thumbnail_url=thumb, handle=handle)


def uploads_playlist_id_from_channels_item(item: dict[str, Any]) -> Optional[str]:
    return (((item.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads"))
