-- Function to bootstrap a tenant with its first admin user
-- Called after user signup, assigns tenant_admin role and membership
CREATE OR REPLACE FUNCTION public.bootstrap_tenant_admin(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add tenant membership
  INSERT INTO public.tenant_memberships (tenant_id, user_id, is_active)
  VALUES (p_tenant_id, p_user_id, true)
  ON CONFLICT DO NOTHING;

  -- Assign tenant_admin role
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (p_user_id, 'tenant_admin', p_tenant_id)
  ON CONFLICT DO NOTHING;
END;
$$;