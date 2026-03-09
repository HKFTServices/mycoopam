-- Create a security definer function to check if a user is admin of any tenant
-- that the target user belongs to
CREATE OR REPLACE FUNCTION public.is_tenant_admin_of_user(_admin_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.user_roles ur ON ur.user_id = _admin_id
      AND ur.role = 'tenant_admin'
      AND ur.tenant_id = tm.tenant_id
    WHERE tm.user_id = _target_user_id
  )
$$;

-- Replace the profiles policy to use the security definer function
DROP POLICY "Tenant admins can view tenant profiles" ON public.profiles;

CREATE POLICY "Tenant admins can view tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_tenant_admin_of_user(auth.uid(), user_id)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);