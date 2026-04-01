
-- Table for tenant payment method configuration
CREATE TABLE public.tenant_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  method_code TEXT NOT NULL,
  method_label TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  fee_type_id UUID REFERENCES public.transaction_fee_types(id) ON DELETE SET NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, method_code)
);

ALTER TABLE public.tenant_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view payment methods"
  ON public.tenant_payment_methods FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage payment methods"
  ON public.tenant_payment_methods FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE TRIGGER update_tenant_payment_methods_updated_at
  BEFORE UPDATE ON public.tenant_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
