-- v0 core schema: static watchlists, youtube ingestion, snapshots, alerts

CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.watchlists (
  watchlist_id text PRIMARY KEY,
  email text,
  slack_webhook_url text,
  enabled boolean NOT NULL DEFAULT true,
  video_types text[] NOT NULL DEFAULT ARRAY['long','short'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.watchlist_channels (
  watchlist_id text NOT NULL REFERENCES core.watchlists(watchlist_id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, channel_id)
);

CREATE TABLE IF NOT EXISTS core.channels (
  channel_id text PRIMARY KEY,
  title text,
  uploads_playlist_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE core.watchlist_channels
  ADD CONSTRAINT watchlist_channels_channel_fk
  FOREIGN KEY (channel_id) REFERENCES core.channels(channel_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS core.videos (
  video_id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES core.channels(channel_id) ON DELETE CASCADE,
  title text NOT NULL,
  published_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  video_type text NOT NULL CHECK (video_type IN ('short','long')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.video_stats_snapshots (
  id bigserial PRIMARY KEY,
  video_id text NOT NULL REFERENCES core.videos(video_id) ON DELETE CASCADE,
  pulled_at timestamptz NOT NULL,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_stats_snapshots_uniq UNIQUE (video_id, pulled_at)
);

CREATE INDEX IF NOT EXISTS video_stats_snapshots_video_pulled_idx
  ON core.video_stats_snapshots(video_id, pulled_at DESC);

CREATE INDEX IF NOT EXISTS videos_channel_type_published_idx
  ON core.videos(channel_id, video_type, published_at DESC);

CREATE TABLE IF NOT EXISTS core.alerts_sent (
  id bigserial PRIMARY KEY,
  watchlist_id text NOT NULL REFERENCES core.watchlists(watchlist_id) ON DELETE CASCADE,
  channel_id text NOT NULL REFERENCES core.channels(channel_id) ON DELETE CASCADE,
  video_id text NOT NULL REFERENCES core.videos(video_id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerts_sent_uniq UNIQUE (watchlist_id, video_id, rule_type)
);

CREATE INDEX IF NOT EXISTS alerts_sent_watchlist_channel_date_idx
  ON core.alerts_sent(watchlist_id, channel_id, sent_at DESC);

