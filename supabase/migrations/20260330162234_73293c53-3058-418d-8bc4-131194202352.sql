
CREATE TABLE public.tenant_payment_gateways (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL DEFAULT 'stripe',
  is_active BOOLEAN NOT NULL DEFAULT false,
  api_key_public TEXT,
  api_key_secret_name TEXT,
  merchant_id TEXT,
  gateway_mode TEXT NOT NULL DEFAULT 'test',
  gateway_fee_type TEXT NOT NULL DEFAULT 'percentage',
  gateway_fee_percentage NUMERIC NOT NULL DEFAULT 0,
  gateway_fee_fixed NUMERIC NOT NULL DEFAULT 0,
  gateway_fee_passed_to TEXT NOT NULL DEFAULT 'member',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, gateway_name)
);

ALTER TABLE public.tenant_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage payment gateways"
  ON public.tenant_payment_gateways
  FOR ALL
  TO authenticated
  USING (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE POLICY "Authenticated members can view active gateways"
  ON public.tenant_payment_gateways
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) AND is_active = true);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenant_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
