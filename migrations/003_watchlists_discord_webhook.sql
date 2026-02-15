-- Add Discord webhook override support per watchlist (optional).

ALTER TABLE core.watchlists
  ADD COLUMN IF NOT EXISTS discord_webhook_url text;

