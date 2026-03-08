
-- Add client_account_id column to entity_accounts for legacy integer ID lookups
ALTER TABLE public.entity_accounts ADD COLUMN IF NOT EXISTS client_account_id integer;
CREATE INDEX IF NOT EXISTS idx_entity_accounts_client_account_id ON public.entity_accounts(client_account_id);
