
-- Create transaction_types table
CREATE TABLE public.transaction_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Enable RLS
ALTER TABLE public.transaction_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all transaction types"
  ON public.transaction_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant transaction types"
  ON public.transaction_types FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view transaction types"
  ON public.transaction_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_transaction_types_updated_at
  BEFORE UPDATE ON public.transaction_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Seed default transaction types for all existing tenants
INSERT INTO public.transaction_types (tenant_id, name, code, description)
SELECT t.id, v.name, v.code, v.description
FROM public.tenants t
CROSS JOIN (VALUES
  ('Deposit Funds', 'DEPOSIT_FUNDS', 'Deposit of funds into an account'),
  ('Deposit Stock', 'DEPOSIT_STOCK', 'Deposit of stock/metal into an account'),
  ('Withdraw Funds', 'WITHDRAW_FUNDS', 'Withdrawal of funds from an account'),
  ('Withdraw Stock', 'WITHDRAW_STOCK', 'Withdrawal of stock/metal from an account'),
  ('Switch', 'SWITCH', 'Switch between pools or items'),
  ('Transfer', 'TRANSFER', 'Transfer between accounts')
) AS v(name, code, description);
