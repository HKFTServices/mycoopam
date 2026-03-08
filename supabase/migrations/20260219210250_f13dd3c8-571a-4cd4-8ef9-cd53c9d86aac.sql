
ALTER TABLE public.admin_stock_transactions
  ADD COLUMN IF NOT EXISTS counterparty_entity_account_id uuid NULL,
  ADD COLUMN IF NOT EXISTS counterparty_entity_id uuid NULL;

COMMENT ON COLUMN public.admin_stock_transactions.counterparty_entity_account_id IS 'Supplier (Purchases) or Customer (Sales) entity account linked to this stock transaction';
COMMENT ON COLUMN public.admin_stock_transactions.counterparty_entity_id IS 'Entity (person/company) for the counterparty';
