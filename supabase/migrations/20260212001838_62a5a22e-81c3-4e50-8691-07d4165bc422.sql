
-- Add is_approved column to entity_accounts (is_active already exists)
ALTER TABLE public.entity_accounts ADD COLUMN is_approved boolean NOT NULL DEFAULT false;

-- Set is_approved = true for any accounts that already have an account_number allocated
UPDATE public.entity_accounts SET is_approved = true WHERE account_number IS NOT NULL;
