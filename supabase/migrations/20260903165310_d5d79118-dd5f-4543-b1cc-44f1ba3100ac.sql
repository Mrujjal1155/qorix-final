ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS site_url text,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS bot_username text,
  ADD COLUMN IF NOT EXISTS support_contact text,
  ADD COLUMN IF NOT EXISTS markup_percent numeric NOT NULL DEFAULT 25;