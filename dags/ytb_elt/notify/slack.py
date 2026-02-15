import json
import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def send_slack_webhook(*, webhook_url: str, text: str, blocks: Optional[list] = None) -> None:
    if not webhook_url:
        raise ValueError("webhook_url is required")
    if not text:
        raise ValueError("text is required")

    payload = {"text": text}
    if blocks:
        payload["blocks"] = blocks

    resp = requests.post(webhook_url, data=json.dumps(payload), headers={"Content-Type": "application/json"}, timeout=15)
    if resp.status_code >= 400:
        logger.error("Slack webhook failed: %s %s", resp.status_code, resp.text[:3000])
        resp.raise_for_status()

