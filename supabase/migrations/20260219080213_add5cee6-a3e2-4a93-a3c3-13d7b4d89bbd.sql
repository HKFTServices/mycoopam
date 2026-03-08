-- Add transaction_id column to stock_transactions to link to cashflow_transactions
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS transaction_id uuid NULL;
COMMENT ON COLUMN public.stock_transactions.transaction_id IS 'Links to the root cashflow_transactions record';