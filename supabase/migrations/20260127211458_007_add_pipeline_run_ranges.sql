-- 007: Add accepted-range observability to pipeline_runs

alter table public.pipeline_runs
  add column if not exists first_accepted_service_request_id varchar(20),
  add column if not exists last_accepted_service_request_id varchar(20),
  add column if not exists min_accepted_requested_at timestamptz,
  add column if not exists max_accepted_requested_at timestamptz;

create index if not exists idx_pipeline_runs_last_accepted_srid
  on public.pipeline_runs(last_accepted_service_request_id);

create index if not exists idx_pipeline_runs_max_accepted_requested_at
  on public.pipeline_runs(max_accepted_requested_at desc);
;
