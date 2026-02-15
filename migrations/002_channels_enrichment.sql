ALTER TABLE core.channels ADD COLUMN IF NOT EXISTS handle text;
ALTER TABLE core.channels ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE core.channels ADD COLUMN IF NOT EXISTS last_resolved_at timestamptz;

