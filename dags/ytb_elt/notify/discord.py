import json
import logging

import requests

logger = logging.getLogger(__name__)


def send_discord_webhook(*, webhook_url: str, content: str) -> None:
    """
    Send a message to a Discord channel via an Incoming Webhook URL.

    Discord expects JSON: {"content": "..."}.
    """
    if not webhook_url:
        raise ValueError("webhook_url is required")
    if not content:
        raise ValueError("content is required")

    payload = {"content": content}
    resp = requests.post(webhook_url, data=json.dumps(payload), headers={"Content-Type": "application/json"}, timeout=15)
    if resp.status_code >= 400:
        logger.error("Discord webhook failed: %s %s", resp.status_code, resp.text[:3000])
        resp.raise_for_status()

