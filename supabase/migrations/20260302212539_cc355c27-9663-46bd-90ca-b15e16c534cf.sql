-- Remove referrer columns from entity_accounts (reverting previous migration)
DROP INDEX IF EXISTS idx_entity_accounts_referrer_id;
ALTER TABLE public.entity_accounts DROP COLUMN IF EXISTS referrer_id;
ALTER TABLE public.entity_accounts DROP COLUMN IF EXISTS commission_percentage;