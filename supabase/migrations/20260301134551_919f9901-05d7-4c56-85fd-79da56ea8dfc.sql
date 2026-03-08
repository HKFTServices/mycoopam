
-- Add email signature columns (EN + AF) to tenant_configuration
ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS email_signature_en text,
  ADD COLUMN IF NOT EXISTS email_signature_af text;
