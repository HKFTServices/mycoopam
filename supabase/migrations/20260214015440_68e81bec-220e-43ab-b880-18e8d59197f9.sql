
-- Allow super admins to view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow tenant admins to view profiles of users in their tenant
CREATE POLICY "Tenant admins can view tenant profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = profiles.user_id
      AND tm.is_active = true
      AND has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tm.tenant_id)
  )
);
