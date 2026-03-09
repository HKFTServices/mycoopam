CREATE POLICY "Tenant admins can view tenant memberships"
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (
  has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);