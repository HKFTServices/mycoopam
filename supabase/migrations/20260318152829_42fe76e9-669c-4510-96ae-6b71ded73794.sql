ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS theme_primary_hsl text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS theme_accent_hsl text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS theme_sidebar_hsl text DEFAULT NULL;