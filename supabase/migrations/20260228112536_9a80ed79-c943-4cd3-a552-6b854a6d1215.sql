-- Add slug column to tenants for URL-based routing
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Set default slug for existing tenant
UPDATE public.tenants SET slug = 'aem' WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);