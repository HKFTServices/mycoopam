
-- Step 1: Add entity_account_id UUID FK columns to transactional tables
ALTER TABLE public.member_shares 
  ADD COLUMN entity_account_id uuid REFERENCES public.entity_accounts(id);

ALTER TABLE public.member_pool_holdings 
  ADD COLUMN entity_account_id uuid REFERENCES public.entity_accounts(id);

ALTER TABLE public.transactions 
  ADD COLUMN entity_account_id uuid REFERENCES public.entity_accounts(id);

-- Step 2: Backfill member_shares (78 rows) - resolve client_account_id to entity_accounts.id
UPDATE public.member_shares ms
SET entity_account_id = ea.id
FROM public.entity_accounts ea
WHERE ea.client_account_id = ms.client_account_id
AND ms.client_account_id IS NOT NULL;

-- Step 3: Drop the old client_account_id columns from transactional tables
ALTER TABLE public.member_shares DROP COLUMN client_account_id;
ALTER TABLE public.member_pool_holdings DROP COLUMN client_account_id;
ALTER TABLE public.transactions DROP COLUMN client_account_id;

-- Step 4: Drop client_account_id from entity_accounts itself
ALTER TABLE public.entity_accounts DROP COLUMN client_account_id;

-- Step 5: Drop the sequence that powered client_account_id
DROP SEQUENCE IF EXISTS public.entity_accounts_client_account_seq;

-- Step 6: Create indexes on the new FK columns for performance
CREATE INDEX idx_member_shares_entity_account_id ON public.member_shares(entity_account_id);
CREATE INDEX idx_member_pool_holdings_entity_account_id ON public.member_pool_holdings(entity_account_id);
CREATE INDEX idx_transactions_entity_account_id ON public.transactions(entity_account_id);
