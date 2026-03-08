-- Add transfer-specific columns to transactions table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_to_account_id uuid REFERENCES public.entity_accounts(id),
  ADD COLUMN IF NOT EXISTS receiver_approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS receiver_approved_by uuid;

-- Index for quick lookup of pending transfers for a given receiver account
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_to_account_id 
  ON public.transactions(transfer_to_account_id) 
  WHERE transfer_to_account_id IS NOT NULL;
