-- Security-definer helper functions for dashboard queries.
-- These run with elevated privileges (migration owner) and return user-scoped rows.

create or replace function core._require_auth()
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
end;
$$;

create or replace function core.get_tracked_channels_status()
returns table (
  channel_id text,
  title text,
  handle text,
  thumbnail_url text,
  subscriber_count bigint,
  last_snapshot_at timestamptz,
  videos_count bigint
)
language plpgsql
security definer
set search_path = core, public
as $$
begin
  perform core._require_auth();

  return query
  select
    c.channel_id,
    c.title,
    c.handle,
    c.thumbnail_url,
    c.subscriber_count,
    (
      select max(s.pulled_at)
      from core.videos v
      join core.video_stats_snapshots s on s.video_id = v.video_id
      where v.channel_id = c.channel_id
    ) as last_snapshot_at,
    (
      select count(*)
      from core.videos v
      where v.channel_id = c.channel_id
    ) as videos_count
  from core.watchlist_channels wc
  join core.channels c on c.channel_id = wc.channel_id
  where wc.watchlist_id = auth.uid()::text
  order by coalesce(c.title, c.channel_id);
end;
$$;

create or replace function core.get_recent_alerts(limit_rows int default 20)
returns table (
  sent_at timestamptz,
  channel_id text,
  channel_title text,
  video_id text,
  video_title text,
  rule_type text
)
language plpgsql
security definer
set search_path = core, public
as $$
begin
  perform core._require_auth();

  return query
  select
    a.sent_at,
    a.channel_id,
    coalesce(c.title, a.channel_id) as channel_title,
    a.video_id,
    coalesce(v.title, a.video_id) as video_title,
    a.rule_type
  from core.alerts_sent a
  left join core.channels c on c.channel_id = a.channel_id
  left join core.videos v on v.video_id = a.video_id
  where a.watchlist_id = auth.uid()::text
  order by a.sent_at desc
  limit greatest(limit_rows, 1);
end;
$$;

create or replace function core.get_top_movers(limit_rows int default 20)
returns table (
  channel_id text,
  channel_title text,
  video_type text,
  video_id text,
  title text,
  published_at timestamptz,
  pulled_at_now timestamptz,
  views_now bigint,
  views_per_hour numeric
)
language plpgsql
security definer
set search_path = core, public
as $$
begin
  perform core._require_auth();

  return query
  with tracked_channels as (
    select wc.channel_id
    from core.watchlist_channels wc
    where wc.watchlist_id = auth.uid()::text
  ),
  candidates as (
    select v.video_id, v.channel_id, v.title, v.published_at, v.video_type
    from core.videos v
    join tracked_channels tc on tc.channel_id = v.channel_id
    where v.published_at >= now() - interval '7 days'
  ),
  last_two as (
    select
      s.video_id,
      s.pulled_at,
      s.view_count,
      row_number() over (partition by s.video_id order by s.pulled_at desc) as rn
    from core.video_stats_snapshots s
    join candidates c on c.video_id = s.video_id
    where s.view_count is not null
  ),
  pairs as (
    select
      c.channel_id,
      c.video_type,
      c.video_id,
      c.title,
      c.published_at,
      max(case when l.rn = 1 then l.pulled_at end) as t1,
      max(case when l.rn = 1 then l.view_count end) as v1,
      max(case when l.rn = 2 then l.pulled_at end) as t0,
      max(case when l.rn = 2 then l.view_count end) as v0
    from candidates c
    join last_two l on l.video_id = c.video_id and l.rn in (1, 2)
    group by c.channel_id, c.video_type, c.video_id, c.title, c.published_at
  )
  select
    p.channel_id,
    coalesce(ch.title, p.channel_id) as channel_title,
    p.video_type,
    p.video_id,
    p.title,
    p.published_at,
    p.t1 as pulled_at_now,
    p.v1 as views_now,
    case
      when p.t0 is null or p.t1 is null then null
      when p.v0 is null or p.v1 is null then null
      when extract(epoch from (p.t1 - p.t0)) <= 0 then null
      when (p.v1 - p.v0) < 0 then null
      else ((p.v1 - p.v0)::numeric / (extract(epoch from (p.t1 - p.t0)) / 3600.0))
    end as views_per_hour
  from pairs p
  left join core.channels ch on ch.channel_id = p.channel_id
  order by views_per_hour desc nulls last
  limit greatest(limit_rows, 1);
end;
$$;
