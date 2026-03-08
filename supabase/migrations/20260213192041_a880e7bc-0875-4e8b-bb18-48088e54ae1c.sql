
ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS shares_class1_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shares_class1_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_class1_max_per_member integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_class2_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shares_class2_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_class2_max_per_member integer NOT NULL DEFAULT 0;
