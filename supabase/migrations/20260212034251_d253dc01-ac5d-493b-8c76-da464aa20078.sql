
-- Create transaction_fee_types table
CREATE TABLE public.transaction_fee_types (
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
ALTER TABLE public.transaction_fee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all transaction fee types"
  ON public.transaction_fee_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant transaction fee types"
  ON public.transaction_fee_types FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view transaction fee types"
  ON public.transaction_fee_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_transaction_fee_types_updated_at
  BEFORE UPDATE ON public.transaction_fee_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Seed defaults
INSERT INTO public.transaction_fee_types (tenant_id, name, code, description)
SELECT t.id, v.name, v.code, v.description
FROM public.tenants t
CROSS JOIN (VALUES
  ('Administration Fees', 'ADMIN_FEES', 'General administration fees'),
  ('Cash Deposit Fees', 'CASH_DEPOSIT_FEES', 'Fees for cash deposits'),
  ('Courier Fees', 'COURIER_FEES', 'Fees for courier and delivery services')
) AS v(name, code, description);
