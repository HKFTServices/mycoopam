
-- Add GL account linkage and VAT fields to cashflow_transactions
ALTER TABLE public.cashflow_transactions
  ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES public.gl_accounts(id),
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_excl_vat numeric NOT NULL DEFAULT 0;

-- Index for GL account lookups
CREATE INDEX IF NOT EXISTS idx_cft_gl_account_id ON public.cashflow_transactions(gl_account_id);
