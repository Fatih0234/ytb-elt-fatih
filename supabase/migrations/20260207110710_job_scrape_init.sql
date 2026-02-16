create schema if not exists job_scrape;

create or replace function job_scrape.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists job_scrape.search_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source text not null default 'linkedin',
  enabled boolean not null default true,
  keywords text not null default '',
  country_name text not null,
  geo_id text null,
  location_text text not null,
  facets jsonb not null default '{}'::jsonb,
  cities_mode text not null default 'country_only',
  cities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_search_definitions_updated_at
before update on job_scrape.search_definitions
for each row execute function job_scrape.set_updated_at();

create table if not exists job_scrape.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  trigger text not null default 'manual',
  status text not null default 'running',
  stats jsonb not null default '{}'::jsonb,
  error text null
);

create table if not exists job_scrape.search_runs (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references job_scrape.crawl_runs(id) on delete cascade,
  search_definition_id uuid not null references job_scrape.search_definitions(id) on delete cascade,
  status text not null default 'running',
  pages_fetched integer not null default 0,
  jobs_discovered integer not null default 0,
  blocked boolean not null default false,
  error text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  unique(crawl_run_id, search_definition_id)
);

create table if not exists job_scrape.jobs (
  source text not null,
  job_id text not null,
  job_url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_search_run_id uuid null references job_scrape.search_runs(id) on delete set null,
  primary key (source, job_id)
);

create table if not exists job_scrape.job_search_hits (
  search_run_id uuid not null references job_scrape.search_runs(id) on delete cascade,
  source text not null,
  job_id text not null,
  rank integer not null,
  page_start integer not null,
  scraped_at timestamptz not null,
  primary key (search_run_id, source, job_id),
  foreign key (source, job_id) references job_scrape.jobs(source, job_id) on delete cascade
);

create table if not exists job_scrape.job_details (
  source text not null,
  job_id text not null,
  scraped_at timestamptz not null,
  job_title text null,
  company_name text null,
  job_location text null,
  posted_time_ago text null,
  job_description text null,
  criteria jsonb not null default '{}'::jsonb,
  parse_ok boolean not null default true,
  last_error text null,
  primary key (source, job_id),
  foreign key (source, job_id) references job_scrape.jobs(source, job_id) on delete cascade
);

create table if not exists job_scrape.linkedin_geo_cache (
  key text primary key,
  id text not null,
  display_name text null,
  type text null,
  updated_at timestamptz not null default now()
);

create table if not exists job_scrape.linkedin_facet_cache (
  geo_id text primary key,
  label_to_value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_search_definitions_enabled on job_scrape.search_definitions(enabled);
create index if not exists idx_search_runs_crawl_run_id on job_scrape.search_runs(crawl_run_id);
create index if not exists idx_jobs_last_seen_at on job_scrape.jobs(last_seen_at);
create index if not exists idx_job_details_scraped_at on job_scrape.job_details(scraped_at);

-- RLS (single-user: allow any authenticated user)
alter table job_scrape.search_definitions enable row level security;
alter table job_scrape.crawl_runs enable row level security;
alter table job_scrape.search_runs enable row level security;
alter table job_scrape.jobs enable row level security;
alter table job_scrape.job_search_hits enable row level security;
alter table job_scrape.job_details enable row level security;
alter table job_scrape.linkedin_geo_cache enable row level security;
alter table job_scrape.linkedin_facet_cache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='search_definitions' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.search_definitions for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='crawl_runs' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.crawl_runs for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='search_runs' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.search_runs for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='jobs' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.jobs for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='job_search_hits' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.job_search_hits for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='job_details' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.job_details for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='linkedin_geo_cache' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.linkedin_geo_cache for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='job_scrape' and tablename='linkedin_facet_cache' and policyname='auth_all') then
    execute 'create policy auth_all on job_scrape.linkedin_facet_cache for all to authenticated using (true) with check (true)';
  end if;
end $$;
;
