
-- Fee rules: links a fee type to a transaction type with a calculation method
CREATE TABLE public.transaction_fee_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  fee_type_id UUID NOT NULL REFERENCES public.transaction_fee_types(id) ON DELETE CASCADE,
  transaction_type_id UUID NOT NULL REFERENCES public.transaction_types(id) ON DELETE CASCADE,
  calculation_method TEXT NOT NULL DEFAULT 'percentage' CHECK (calculation_method IN ('percentage', 'fixed_amount', 'sliding_scale')),
  fixed_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, fee_type_id, transaction_type_id)
);

-- Fee tiers for sliding scale
CREATE TABLE public.transaction_fee_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fee_rule_id UUID NOT NULL REFERENCES public.transaction_fee_rules(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  min_amount NUMERIC NOT NULL DEFAULT 0,
  max_amount NUMERIC,
  percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.transaction_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_fee_tiers ENABLE ROW LEVEL SECURITY;

-- Fee rules policies
CREATE POLICY "Super admins can manage all fee rules" ON public.transaction_fee_rules FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant fee rules" ON public.transaction_fee_rules FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view fee rules" ON public.transaction_fee_rules FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Fee tiers policies
CREATE POLICY "Super admins can manage all fee tiers" ON public.transaction_fee_tiers FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant fee tiers" ON public.transaction_fee_tiers FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view fee tiers" ON public.transaction_fee_tiers FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_transaction_fee_rules_updated_at
  BEFORE UPDATE ON public.transaction_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_transaction_fee_tiers_updated_at
  BEFORE UPDATE ON public.transaction_fee_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
