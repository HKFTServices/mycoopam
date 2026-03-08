
-- Add membership_fee column to entity_account_types for tenant admins to configure fees
ALTER TABLE public.entity_account_types
ADD COLUMN membership_fee numeric NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.entity_account_types.membership_fee IS 'Monthly/annual membership fee amount set by tenant admin';
