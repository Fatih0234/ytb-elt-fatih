-- Per-watchlist alert thresholds (read by Airflow and editable by the web app).

CREATE TABLE IF NOT EXISTS core.alert_rules (
  watchlist_id text NOT NULL REFERENCES core.watchlists(watchlist_id) ON DELETE CASCADE,
  video_type text NOT NULL CHECK (video_type IN ('short','long')),
  baseline_window_videos integer NOT NULL DEFAULT 20,
  baseline_hours double precision NOT NULL DEFAULT 6.0,
  multiplier double precision NOT NULL,
  abs_floor_vph double precision NOT NULL,
  min_age_minutes integer NOT NULL,
  max_age_hours double precision NOT NULL,
  daily_cap_per_channel integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, video_type)
);

