
ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS full_membership_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS full_membership_share_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_membership_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_membership_monthly_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS associated_membership_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS associated_membership_share_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS associated_membership_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS associated_membership_monthly_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_membership_type text NOT NULL DEFAULT 'full';
