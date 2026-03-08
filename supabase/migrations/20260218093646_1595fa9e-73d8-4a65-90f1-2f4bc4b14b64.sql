ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS share_gl_account_id uuid REFERENCES public.gl_accounts(id),
  ADD COLUMN IF NOT EXISTS membership_fee_gl_account_id uuid REFERENCES public.gl_accounts(id);