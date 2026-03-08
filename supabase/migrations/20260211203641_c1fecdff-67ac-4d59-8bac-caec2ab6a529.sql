
CREATE TABLE public.tenant_configuration (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  currency_symbol text NOT NULL DEFAULT 'R',
  currency_code text NOT NULL DEFAULT 'ZAR',
  directors text,
  financial_year_end_month integer NOT NULL DEFAULT 2,
  registration_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant configuration"
ON public.tenant_configuration
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own configuration"
ON public.tenant_configuration
FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view configuration"
ON public.tenant_configuration
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_tenant_configuration_updated_at
BEFORE UPDATE ON public.tenant_configuration
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
