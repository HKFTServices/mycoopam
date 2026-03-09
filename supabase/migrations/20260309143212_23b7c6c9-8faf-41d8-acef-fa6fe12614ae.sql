-- Tenant admins can view roles for users in their tenant
CREATE POLICY "Tenant admins can view tenant user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = user_roles.user_id
      AND has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tm.tenant_id)
  )
);

-- Tenant admins can manage roles for users in their tenant
CREATE POLICY "Tenant admins can manage tenant user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)
);