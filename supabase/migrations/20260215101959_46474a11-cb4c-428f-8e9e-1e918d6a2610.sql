
-- First, ensure client_account_id on entity_accounts is unique (needed for FK reference)
ALTER TABLE public.entity_accounts ADD CONSTRAINT entity_accounts_client_account_id_unique UNIQUE (client_account_id);

-- === TRANSACTIONS TABLE ===
-- Drop the old FK constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_entity_account_id_fkey;

-- Add new client_account_id column (text to match entity_accounts.client_account_id)
ALTER TABLE public.transactions ADD COLUMN client_account_id text;

-- Backfill from existing entity_account_id
UPDATE public.transactions t
SET client_account_id = ea.client_account_id
FROM public.entity_accounts ea
WHERE t.entity_account_id = ea.id;

-- Drop old column
ALTER TABLE public.transactions DROP COLUMN entity_account_id;

-- Add FK constraint to entity_accounts.client_account_id
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_client_account_id_fkey
  FOREIGN KEY (client_account_id) REFERENCES public.entity_accounts(client_account_id);

-- === MEMBER_SHARES TABLE ===
-- Drop the old FK constraint
ALTER TABLE public.member_shares DROP CONSTRAINT IF EXISTS member_shares_entity_account_id_fkey;

-- Add new client_account_id column
ALTER TABLE public.member_shares ADD COLUMN client_account_id text;

-- Backfill from existing entity_account_id
UPDATE public.member_shares ms
SET client_account_id = ea.client_account_id
FROM public.entity_accounts ea
WHERE ms.entity_account_id = ea.id;

-- Drop old column
ALTER TABLE public.member_shares DROP COLUMN entity_account_id;

-- Add FK constraint
ALTER TABLE public.member_shares
  ADD CONSTRAINT member_shares_client_account_id_fkey
  FOREIGN KEY (client_account_id) REFERENCES public.entity_accounts(client_account_id);

-- === MEMBER_POOL_HOLDINGS TABLE (also references entity_accounts) ===
ALTER TABLE public.member_pool_holdings DROP CONSTRAINT IF EXISTS member_pool_holdings_entity_account_id_fkey;

ALTER TABLE public.member_pool_holdings ADD COLUMN client_account_id text;

UPDATE public.member_pool_holdings mph
SET client_account_id = ea.client_account_id
FROM public.entity_accounts ea
WHERE mph.entity_account_id = ea.id;

ALTER TABLE public.member_pool_holdings DROP COLUMN entity_account_id;

ALTER TABLE public.member_pool_holdings
  ADD CONSTRAINT member_pool_holdings_client_account_id_fkey
  FOREIGN KEY (client_account_id) REFERENCES public.entity_accounts(client_account_id);
