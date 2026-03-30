
-- Make tax_types.tenant_id nullable for global reference data
ALTER TABLE public.tax_types ALTER COLUMN tenant_id DROP NOT NULL;
