
-- Add transaction_id column to unit_transactions to properly link UT records to their parent transaction
ALTER TABLE public.unit_transactions
ADD COLUMN transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX idx_unit_transactions_transaction_id ON public.unit_transactions(transaction_id);
