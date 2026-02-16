begin;

create table if not exists public.labeling_runs (
  label_run_id bigserial primary key,
  phase text not null check (phase in ('phase1','phase2')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running|success|failed

  model text not null,
  prompt_version text not null,
  dry_run boolean not null default false,
  requested_limit int,

  selected_count int not null default 0,
  attempted_count int not null default 0,
  inserted_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,

  first_labeled_service_request_id varchar(20),
  last_labeled_service_request_id varchar(20),
  min_labeled_requested_at timestamptz,
  max_labeled_requested_at timestamptz,

  error_json jsonb
);

create index if not exists idx_labeling_runs_phase_started_at
  on public.labeling_runs(phase, started_at desc);
create index if not exists idx_labeling_runs_status_started_at
  on public.labeling_runs(status, started_at desc);
create index if not exists idx_labeling_runs_phase_prompt_started_at
  on public.labeling_runs(phase, prompt_version, started_at desc);

commit;
;
