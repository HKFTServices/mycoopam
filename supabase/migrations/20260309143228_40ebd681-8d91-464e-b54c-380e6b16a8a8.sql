DROP POLICY "Tenant admins can view tenant profiles" ON public.profiles;

CREATE POLICY "Tenant admins can view tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = profiles.user_id
      AND has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tm.tenant_id)
  )
);