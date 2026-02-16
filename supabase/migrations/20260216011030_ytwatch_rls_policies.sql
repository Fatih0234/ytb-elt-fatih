-- Row Level Security policies for per-user data.
-- The web app uses the anon key + user JWT; RLS protects user-specific rows.

-- User-scoped tables
alter table core.user_profiles enable row level security;
alter table core.watchlists enable row level security;
alter table core.watchlist_channels enable row level security;
alter table core.alert_rules enable row level security;
alter table core.alerts_sent enable row level security;

-- Pipeline tables: deny direct selects; web app uses RPCs (SECURITY DEFINER).
alter table core.videos enable row level security;
alter table core.video_stats_snapshots enable row level security;

-- user_profiles
drop policy if exists user_profiles_select_own on core.user_profiles;
create policy user_profiles_select_own
  on core.user_profiles for select
  using (user_id = auth.uid());

drop policy if exists user_profiles_insert_own on core.user_profiles;
create policy user_profiles_insert_own
  on core.user_profiles for insert
  with check (user_id = auth.uid());

drop policy if exists user_profiles_update_own on core.user_profiles;
create policy user_profiles_update_own
  on core.user_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_profiles_delete_own on core.user_profiles;
create policy user_profiles_delete_own
  on core.user_profiles for delete
  using (user_id = auth.uid());

-- watchlists (one per user; watchlist_id must equal auth.uid()::text)
drop policy if exists watchlists_select_own on core.watchlists;
create policy watchlists_select_own
  on core.watchlists for select
  using (user_id = auth.uid());

drop policy if exists watchlists_insert_own on core.watchlists;
create policy watchlists_insert_own
  on core.watchlists for insert
  with check (user_id = auth.uid() and watchlist_id = auth.uid()::text);

drop policy if exists watchlists_update_own on core.watchlists;
create policy watchlists_update_own
  on core.watchlists for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists watchlists_delete_own on core.watchlists;
create policy watchlists_delete_own
  on core.watchlists for delete
  using (user_id = auth.uid());

-- watchlist_channels
drop policy if exists watchlist_channels_select_own on core.watchlist_channels;
create policy watchlist_channels_select_own
  on core.watchlist_channels for select
  using (watchlist_id = auth.uid()::text);

drop policy if exists watchlist_channels_insert_own on core.watchlist_channels;
create policy watchlist_channels_insert_own
  on core.watchlist_channels for insert
  with check (watchlist_id = auth.uid()::text);

drop policy if exists watchlist_channels_delete_own on core.watchlist_channels;
create policy watchlist_channels_delete_own
  on core.watchlist_channels for delete
  using (watchlist_id = auth.uid()::text);

-- alert_rules
drop policy if exists alert_rules_select_own on core.alert_rules;
create policy alert_rules_select_own
  on core.alert_rules for select
  using (watchlist_id = auth.uid()::text);

drop policy if exists alert_rules_insert_own on core.alert_rules;
create policy alert_rules_insert_own
  on core.alert_rules for insert
  with check (watchlist_id = auth.uid()::text);

drop policy if exists alert_rules_update_own on core.alert_rules;
create policy alert_rules_update_own
  on core.alert_rules for update
  using (watchlist_id = auth.uid()::text)
  with check (watchlist_id = auth.uid()::text);

drop policy if exists alert_rules_delete_own on core.alert_rules;
create policy alert_rules_delete_own
  on core.alert_rules for delete
  using (watchlist_id = auth.uid()::text);

-- alerts_sent: read-only for users
drop policy if exists alerts_sent_select_own on core.alerts_sent;
create policy alerts_sent_select_own
  on core.alerts_sent for select
  using (watchlist_id = auth.uid()::text);

