-- Create GL Accounts table (tenant-specific)
CREATE TABLE public.gl_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  gl_type TEXT NOT NULL DEFAULT 'income',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Enable RLS
ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all gl_accounts"
  ON public.gl_accounts FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can manage tenant gl_accounts"
  ON public.gl_accounts FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE POLICY "Tenant members can view gl_accounts"
  ON public.gl_accounts FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'));

-- Add updated_at trigger
CREATE TRIGGER update_gl_accounts_updated_at
  BEFORE UPDATE ON public.gl_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add GL account and Cash Control Account columns to transaction_fee_types
ALTER TABLE public.transaction_fee_types
  ADD COLUMN gl_account_id UUID REFERENCES public.gl_accounts(id),
  ADD COLUMN cash_control_account_id UUID REFERENCES public.control_accounts(id);