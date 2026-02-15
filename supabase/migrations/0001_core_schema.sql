-- Core schema for Supabase (multi-user, one watchlist per user).
-- This is intended for a fresh Supabase project. It uses auth.users for identity.

create schema if not exists staging;
create schema if not exists core;

create table if not exists core.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  interests text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.watchlists (
  watchlist_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  slack_webhook_url text,
  discord_webhook_url text,
  enabled boolean not null default true,
  video_types text[] not null default array['long','short'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlists_watchlist_id_matches_user_id check (watchlist_id = user_id::text)
);

create table if not exists core.channels (
  channel_id text primary key,
  title text,
  uploads_playlist_id text,
  handle text,
  thumbnail_url text,
  last_resolved_at timestamptz,
  subscriber_count bigint,
  video_count bigint,
  view_count bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.watchlist_channels (
  watchlist_id text not null references core.watchlists(watchlist_id) on delete cascade,
  channel_id text not null references core.channels(channel_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, channel_id)
);

create table if not exists core.videos (
  video_id text primary key,
  channel_id text not null references core.channels(channel_id) on delete cascade,
  title text not null,
  published_at timestamptz not null,
  duration_seconds integer not null,
  video_type text not null check (video_type in ('short','long')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_channel_type_published_idx
  on core.videos(channel_id, video_type, published_at desc);

create table if not exists core.video_stats_snapshots (
  id bigserial primary key,
  video_id text not null references core.videos(video_id) on delete cascade,
  pulled_at timestamptz not null,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  created_at timestamptz not null default now(),
  constraint video_stats_snapshots_uniq unique (video_id, pulled_at)
);

create index if not exists video_stats_snapshots_video_pulled_idx
  on core.video_stats_snapshots(video_id, pulled_at desc);

create table if not exists core.alert_rules (
  watchlist_id text not null references core.watchlists(watchlist_id) on delete cascade,
  video_type text not null check (video_type in ('short','long')),
  baseline_window_videos int not null default 20,
  baseline_hours numeric not null default 6,
  multiplier numeric not null,
  abs_floor_vph numeric not null,
  min_age_minutes int not null,
  max_age_hours numeric not null,
  daily_cap_per_channel int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (watchlist_id, video_type)
);

create table if not exists core.alerts_sent (
  id bigserial primary key,
  watchlist_id text not null references core.watchlists(watchlist_id) on delete cascade,
  channel_id text not null references core.channels(channel_id) on delete cascade,
  video_id text not null references core.videos(video_id) on delete cascade,
  rule_type text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint alerts_sent_uniq unique (watchlist_id, video_id, rule_type)
);

create index if not exists alerts_sent_watchlist_channel_date_idx
  on core.alerts_sent(watchlist_id, channel_id, sent_at desc);

