
-- Pool price update schedules (daily time slots)
CREATE TABLE public.pool_price_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  pool_id UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  update_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, pool_id, update_time)
);

ALTER TABLE public.pool_price_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all pool_price_schedules"
  ON public.pool_price_schedules FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant pool_price_schedules"
  ON public.pool_price_schedules FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view pool_price_schedules"
  ON public.pool_price_schedules FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Pool transaction rules (To/From matrix per transaction type)
CREATE TABLE public.pool_transaction_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  pool_id UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  transaction_type_id UUID NOT NULL REFERENCES public.transaction_types(id),
  allow_to BOOLEAN NOT NULL DEFAULT false,
  allow_from BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, pool_id, transaction_type_id)
);

ALTER TABLE public.pool_transaction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all pool_transaction_rules"
  ON public.pool_transaction_rules FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant pool_transaction_rules"
  ON public.pool_transaction_rules FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view pool_transaction_rules"
  ON public.pool_transaction_rules FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));
