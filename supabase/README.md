# Supabase (V1)

This repo uses Supabase for:
- Google OAuth login (Supabase Auth)
- A single Postgres database as the source of truth
- Row Level Security (RLS) for per-user watchlists/settings

## Apply migrations
In your Supabase project:
1. Open SQL Editor
2. Run the files in `/supabase/migrations` in numeric order:
   - `0001_core_schema.sql`
   - `0002_rls_policies.sql`
   - `0003_rpc_functions.sql`

## Required env vars for `/web`
Create `/web/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `YOUTUBE_API_KEY`

## Airflow connection (prod)
Airflow should connect to Supabase Postgres using a role that can write to `core.*`.
Recommended: create a dedicated DB role for Airflow and grant it `BYPASSRLS` so ingestion + alerts are not blocked by RLS.

