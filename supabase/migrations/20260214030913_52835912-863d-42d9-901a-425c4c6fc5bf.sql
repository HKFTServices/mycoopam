-- Add legacy tracking columns to transactions for historical imports
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS legacy_transaction_id text,
  ADD COLUMN IF NOT EXISTS transaction_date date;

-- Add legacy tracking to operating_journals
ALTER TABLE public.operating_journals
  ADD COLUMN IF NOT EXISTS legacy_id text,
  ADD COLUMN IF NOT EXISTS legacy_transaction_id text;

-- Index for legacy lookups during import
CREATE INDEX IF NOT EXISTS idx_transactions_legacy_tid ON public.transactions(legacy_transaction_id);
CREATE INDEX IF NOT EXISTS idx_operating_journals_legacy_id ON public.operating_journals(legacy_id);
CREATE INDEX IF NOT EXISTS idx_operating_journals_legacy_tid ON public.operating_journals(legacy_transaction_id);