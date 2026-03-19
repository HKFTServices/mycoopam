ALTER TABLE public.pool_fee_configurations 
  ADD COLUMN IF NOT EXISTS admin_share_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_by_administrator boolean NOT NULL DEFAULT false;