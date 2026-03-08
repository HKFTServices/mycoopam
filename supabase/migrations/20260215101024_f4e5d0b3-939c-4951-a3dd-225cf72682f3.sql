
-- 1. Rename legacy_client_account_id to client_account_id on entity_accounts
ALTER TABLE public.entity_accounts RENAME COLUMN legacy_client_account_id TO client_account_id;

-- 2. Drop legacy_client_account_id from entities (no longer needed)
ALTER TABLE public.entities DROP COLUMN IF EXISTS legacy_client_account_id;

-- 3. Create a sequence for auto-generating client_account_id for new accounts
CREATE SEQUENCE IF NOT EXISTS public.entity_accounts_client_account_seq START WITH 10000;

-- 4. Set default so new rows auto-get a client_account_id
ALTER TABLE public.entity_accounts ALTER COLUMN client_account_id SET DEFAULT nextval('public.entity_accounts_client_account_seq');

-- 5. Backfill any existing rows that have null client_account_id
UPDATE public.entity_accounts
SET client_account_id = nextval('public.entity_accounts_client_account_seq')::text
WHERE client_account_id IS NULL;
