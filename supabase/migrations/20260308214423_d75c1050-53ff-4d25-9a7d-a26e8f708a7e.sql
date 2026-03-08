ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.pools(id);