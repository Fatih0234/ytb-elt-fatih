-- 005: Add indexes on canonical public.events without name collisions

create index if not exists idx_events_canonical_requested_at
  on public.events(requested_at desc);

create index if not exists idx_events_canonical_status
  on public.events(status);

create index if not exists idx_events_canonical_year
  on public.events(year);

create index if not exists idx_events_canonical_category
  on public.events(category);

create index if not exists idx_events_canonical_subcategory
  on public.events(subcategory);

create index if not exists idx_events_canonical_location
  on public.events using gist (ll_to_earth(lat::double precision, lon::double precision));
;
