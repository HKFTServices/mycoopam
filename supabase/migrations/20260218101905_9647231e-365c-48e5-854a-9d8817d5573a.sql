
ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS bank_gl_account_id uuid REFERENCES public.gl_accounts(id),
  ADD COLUMN IF NOT EXISTS commission_income_gl_account_id uuid REFERENCES public.gl_accounts(id),
  ADD COLUMN IF NOT EXISTS commission_paid_gl_account_id uuid REFERENCES public.gl_accounts(id);
