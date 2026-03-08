
-- Table to store pool-level fee configurations (frequency + percentage/amount per fee type per pool)
CREATE TABLE public.pool_fee_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  fee_type_id UUID NOT NULL REFERENCES public.transaction_fee_types(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  percentage NUMERIC NOT NULL DEFAULT 0,
  fixed_amount NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, fee_type_id, pool_id)
);

ALTER TABLE public.pool_fee_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all pool_fee_configurations"
  ON public.pool_fee_configurations FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant pool_fee_configurations"
  ON public.pool_fee_configurations FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view pool_fee_configurations"
  ON public.pool_fee_configurations FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_pool_fee_configurations_updated_at
  BEFORE UPDATE ON public.pool_fee_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
