
-- Add pool_id column to stock_transactions table
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.pools(id);
