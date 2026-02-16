-- Grant PostgREST roles access to the custom schemas/tables.
-- RLS still controls row access; without these grants, PostgREST returns "permission denied"
-- or "Invalid schema" style errors when calling supabase.schema("core").

-- Schema usage
grant usage on schema core to anon, authenticated;
grant usage on schema staging to anon, authenticated;

-- Tables
grant select, insert, update, delete on all tables in schema core to anon, authenticated;
grant select, insert, update, delete on all tables in schema staging to anon, authenticated;

-- Sequences (bigserial / identity)
grant usage, select on all sequences in schema core to anon, authenticated;
grant usage, select on all sequences in schema staging to anon, authenticated;

-- Functions (RPC)
grant execute on all functions in schema core to anon, authenticated;

-- Default privileges for future objects
alter default privileges in schema core grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema core grant usage, select on sequences to anon, authenticated;
alter default privileges in schema core grant execute on functions to anon, authenticated;

alter default privileges in schema staging grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema staging grant usage, select on sequences to anon, authenticated;

