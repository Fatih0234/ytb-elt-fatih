import logging
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)


class YouTubeClient:
    def __init__(self, api_key: str, *, timeout: int = 20):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.timeout = timeout

    def _get(self, url: str, *, retries: int = 5, backoff_s: float = 1.0) -> Dict[str, Any]:
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
                logger.warning("YouTube GET failed (attempt %s/%s): %s; sleeping %.1fs", attempt, retries, e, sleep_s)
                time.sleep(sleep_s)
        raise last_exc  # type: ignore[misc]

    def get_channel_uploads_playlist(self, channel_id: str) -> Tuple[Optional[str], Optional[str]]:
        url = (
            "https://youtube.googleapis.com/youtube/v3/channels"
            f"?part=contentDetails&part=snippet&id={channel_id}&key={self.api_key}"
        )
        data = self._get(url)
        items = data.get("items") or []
        if not items:
            return None, None
        item = items[0]
        title = (item.get("snippet") or {}).get("title")
        uploads = (((item.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads"))
        return title, uploads

    def list_recent_upload_video_ids(self, uploads_playlist_id: str, *, limit: int = 200) -> List[Tuple[str, str]]:
        """
        Returns [(video_id, published_at)] newest-first.
        """
        out: List[Tuple[str, str]] = []
        page_token = None
        while True:
            url = (
                "https://youtube.googleapis.com/youtube/v3/playlistItems"
                f"?part=contentDetails&part=snippet&maxResults=50&playlistId={uploads_playlist_id}&key={self.api_key}"
            )
            if page_token:
                url += f"&pageToken={page_token}"
            data = self._get(url)
            for item in data.get("items") or []:
                cd = item.get("contentDetails") or {}
                sn = item.get("snippet") or {}
                vid = cd.get("videoId")
                published_at = sn.get("publishedAt")
                if vid and published_at:
                    out.append((vid, published_at))
                if len(out) >= limit:
                    return out[:limit]
            page_token = data.get("nextPageToken")
            if not page_token:
                return out

    def get_videos(self, video_ids: Iterable[str]) -> List[Dict[str, Any]]:
        ids = [v for v in video_ids if v]
        if not ids:
            return []

        url = (
            "https://youtube.googleapis.com/youtube/v3/videos"
            f"?part=snippet&part=contentDetails&part=statistics&id={','.join(ids)}&key={self.api_key}"
        )
        data = self._get(url)
        return data.get("items") or []


def batch(iterable: List[str], size: int) -> List[List[str]]:
    return [iterable[i : i + size] for i in range(0, len(iterable), size)]

