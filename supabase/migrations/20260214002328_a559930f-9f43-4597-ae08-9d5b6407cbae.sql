-- Add VAT registration fields to tenant_configuration
ALTER TABLE public.tenant_configuration ADD COLUMN is_vat_registered boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_configuration ADD COLUMN vat_number text;