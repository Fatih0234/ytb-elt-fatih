-- 004: Align rejects table + canonical view + indexes

-- 1) Ensure rejects table has service_request_id for easier debugging and to match pipeline writer
alter table public.events_rejected
  add column if not exists service_request_id varchar(20);

create index if not exists idx_events_rejected_srid
  on public.events_rejected(service_request_id);

-- 2) Add canonical events indexes (idempotent)
create index if not exists idx_events_requested_at
  on public.events(requested_at desc);

create index if not exists idx_events_status
  on public.events(status);

create index if not exists idx_events_year
  on public.events(year);

create index if not exists idx_events_year_sequence
  on public.events(year, sequence_number);

create index if not exists idx_events_category
  on public.events(category);

create index if not exists idx_events_subcategory
  on public.events(subcategory);

create index if not exists idx_events_location
  on public.events using gist (ll_to_earth(lat::double precision, lon::double precision));

-- 3) Preserve the legacy dashboard view as a backup (optional, safe)
create or replace view public.v_bike_events_legacy as
select
  service_request_id,
  requested_at,
  status,
  category,
  subcategory,
  subcategory2,
  service_name,
  district,
  zip_code,
  city,
  street,
  house_number,
  address_string,
  title,
  description,
  media_path,
  lat::double precision as lat,
  lon::double precision as lon,
  bike_confidence,
  bike_issue_category,
  bike_issue_confidence,
  year,
  sequence_number,
  date_trunc('day', requested_at)   as day,
  date_trunc('week', requested_at)  as week,
  date_trunc('month', requested_at) as month,
  concat_ws(' > ', category, subcategory, nullif(subcategory2, '')) as cat_path,
  case
    when status = 'open' and requested_at < now() - interval '30 days' then '30d+'
    when status = 'open' and requested_at < now() - interval '14 days' then '14–30d'
    when status = 'open' and requested_at < now() - interval '7 days'  then '7–14d'
    when status = 'open' then '0–7d'
    else 'closed'
  end as backlog_bucket,
  case bike_issue_category
    when 'Oberflächenqualität / Schäden' then '🕳️ Oberflächenqualität / Schäden'
    when 'Hindernisse & Blockaden (inkl. Parken & Baustelle)' then '🚧 Hindernisse & Blockaden'
    when 'Müll / Scherben / Splitter (Sharp objects & debris)' then '🧹 Müll / Scherben / Splitter'
    when 'Markierungen & Beschilderung' then '🛑 Markierungen & Beschilderung'
    when 'Ampeln & Signale (inkl. bike-specific Licht)' then '🚦 Ampeln & Signale'
    when 'Sicherheit & Komfort (Geometrie/Führung)' then '🧭 Sicherheit & Komfort'
    when 'Vegetation & Sichtbehinderung' then '🌿 Vegetation & Sichtbehinderung'
    when 'Wasser / Eis / Entwässerung' then '💧 Wasser / Eis / Entwässerung'
    when 'Other / Unklar' then '❓ Other / Unklar'
    else '❓ Unbekannt'
  end as bike_issue_category_emoji,
  case bike_issue_category
    when 'Oberflächenqualität / Schäden' then '🕳️'
    when 'Hindernisse & Blockaden (inkl. Parken & Baustelle)' then '🚧'
    when 'Müll / Scherben / Splitter (Sharp objects & debris)' then '🧹'
    when 'Markierungen & Beschilderung' then '🛑'
    when 'Ampeln & Signale (inkl. bike-specific Licht)' then '🚦'
    when 'Sicherheit & Komfort (Geometrie/Führung)' then '🧭'
    when 'Vegetation & Sichtbehinderung' then '🌿'
    when 'Wasser / Eis / Entwässerung' then '💧'
    when 'Other / Unklar' then '❓'
    else '❓'
  end as bike_issue_emoji
from public.events_legacy
where bike_related is true
  and lat is not null and lon is not null;

-- 4) Recreate dashboard contract view against canonical events + latest labels
create or replace view public.v_bike_events as
with
p1 as (
  select distinct on (service_request_id)
    service_request_id,
    bike_related,
    confidence as bike_confidence
  from public.event_phase1_labels
  order by service_request_id, created_at desc
),
p2 as (
  select distinct on (service_request_id)
    service_request_id,
    bike_issue_category,
    confidence as bike_issue_confidence
  from public.event_phase2_labels
  order by service_request_id, created_at desc
)
select
  e.service_request_id,
  e.requested_at,
  e.status,
  e.category,
  e.subcategory,
  e.subcategory2,
  e.service_name,
  e.district,
  e.zip_code,
  e.city,
  e.street,
  e.house_number,
  e.address_string,
  e.title,
  e.description,
  e.media_path,
  e.lat::double precision as lat,
  e.lon::double precision as lon,
  p1.bike_confidence,
  p2.bike_issue_category,
  p2.bike_issue_confidence,
  e.year,
  e.sequence_number,
  date_trunc('day', e.requested_at)   as day,
  date_trunc('week', e.requested_at)  as week,
  date_trunc('month', e.requested_at) as month,
  concat_ws(' > ', e.category, e.subcategory, nullif(e.subcategory2, '')) as cat_path,
  case
    when e.status = 'open' and e.requested_at < now() - interval '30 days' then '30d+'
    when e.status = 'open' and e.requested_at < now() - interval '14 days' then '14–30d'
    when e.status = 'open' and e.requested_at < now() - interval '7 days'  then '7–14d'
    when e.status = 'open' then '0–7d'
    else 'closed'
  end as backlog_bucket,
  case p2.bike_issue_category
    when 'Oberflächenqualität / Schäden' then '🕳️ Oberflächenqualität / Schäden'
    when 'Hindernisse & Blockaden (inkl. Parken & Baustelle)' then '🚧 Hindernisse & Blockaden'
    when 'Müll / Scherben / Splitter (Sharp objects & debris)' then '🧹 Müll / Scherben / Splitter'
    when 'Markierungen & Beschilderung' then '🛑 Markierungen & Beschilderung'
    when 'Ampeln & Signale (inkl. bike-specific Licht)' then '🚦 Ampeln & Signale'
    when 'Sicherheit & Komfort (Geometrie/Führung)' then '🧭 Sicherheit & Komfort'
    when 'Vegetation & Sichtbehinderung' then '🌿 Vegetation & Sichtbehinderung'
    when 'Wasser / Eis / Entwässerung' then '💧 Wasser / Eis / Entwässerung'
    when 'Other / Unklar' then '❓ Other / Unklar'
    else '❓ Unbekannt'
  end as bike_issue_category_emoji,
  case p2.bike_issue_category
    when 'Oberflächenqualität / Schäden' then '🕳️'
    when 'Hindernisse & Blockaden (inkl. Parken & Baustelle)' then '🚧'
    when 'Müll / Scherben / Splitter (Sharp objects & debris)' then '🧹'
    when 'Markierungen & Beschilderung' then '🛑'
    when 'Ampeln & Signale (inkl. bike-specific Licht)' then '🚦'
    when 'Sicherheit & Komfort (Geometrie/Führung)' then '🧭'
    when 'Vegetation & Sichtbehinderung' then '🌿'
    when 'Wasser / Eis / Entwässerung' then '💧'
    when 'Other / Unklar' then '❓'
    else '❓'
  end as bike_issue_emoji
from public.events e
join p1 on p1.service_request_id = e.service_request_id
left join p2 on p2.service_request_id = e.service_request_id
where p1.bike_related is true
  and e.lat is not null and e.lon is not null;
;
