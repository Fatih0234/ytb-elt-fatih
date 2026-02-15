-- Store basic channel statistics for UI/ops visibility.

ALTER TABLE core.channels
  ADD COLUMN IF NOT EXISTS subscriber_count bigint,
  ADD COLUMN IF NOT EXISTS video_count bigint,
  ADD COLUMN IF NOT EXISTS view_count bigint;

