# Supabase (V1)

This repo uses Supabase for:
- Google OAuth login (Supabase Auth)
- A single Postgres database as the source of truth
- Row Level Security (RLS) for per-user watchlists/settings

## Apply migrations
In your Supabase project:
1. Open SQL Editor
2. Run the files in `/supabase/migrations` in numeric order:
   - `20260216011000_ytwatch_core_schema.sql`
   - `20260216011030_ytwatch_rls_policies.sql`
   - `20260216011100_ytwatch_rpc_functions.sql`

Note: your Supabase project may already have older migrations in history. This repo keeps them
locally (fetched via `supabase migration fetch`) so `supabase db push` can work against the
linked project without migration history conflicts.

## Required env vars for `/web`
Create `/web/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `YOUTUBE_API_KEY`

## Fix Google OAuth: `redirect_uri_mismatch`
This error is almost always Google OAuth config not matching Supabase.

1. In Supabase Dashboard:
   - Authentication -> Providers -> Google: enable and set Client ID/Secret
   - Authentication -> URL Configuration:
     - Site URL: `http://localhost:3000`
     - Additional Redirect URLs: `http://localhost:3000/auth/callback`

2. In Google Cloud Console (OAuth Client ID):
   - Authorized redirect URIs MUST include your Supabase callback:
     - `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

Notes:
- The redirect URI you add to Google is the **Supabase** callback (not your Next.js route).
- When you deploy, also add your production site callback URL to Supabase allowlist:
  - `https://<your-domain>/auth/callback`

## Airflow connection (prod)
Airflow should connect to Supabase Postgres using a role that can write to `core.*`.
Recommended: create a dedicated DB role for Airflow and grant it `BYPASSRLS` so ingestion + alerts are not blocked by RLS.
