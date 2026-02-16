-- 006: Add explicit accepted flag to events_rejected
-- Purpose: distinguish true rejects from accepted-but-needs-review rows.

alter table public.events_rejected
  add column if not exists accepted boolean not null default false;

create index if not exists idx_events_rejected_accepted
  on public.events_rejected(accepted);
;
