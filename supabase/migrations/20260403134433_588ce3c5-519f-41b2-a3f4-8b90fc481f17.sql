
-- Drop existing ALL policy and recreate with broader staff access
DROP POLICY IF EXISTS "Tenant admins can manage payment methods" ON public.tenant_payment_methods;

CREATE POLICY "Tenant staff can manage payment methods"
ON public.tenant_payment_methods
FOR ALL TO authenticated
USING (
  has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)
  OR has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id)
)
WITH CHECK (
  has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)
  OR has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id)
);
