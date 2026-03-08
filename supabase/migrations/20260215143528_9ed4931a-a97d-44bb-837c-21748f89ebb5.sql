
-- Permissions table for configurable role-based access control
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  resource TEXT NOT NULL,        -- e.g. 'fees.admin_share', 'pools.manage', 'items.delete'
  action TEXT NOT NULL DEFAULT 'edit',  -- 'view', 'edit', 'delete', 'manage'
  is_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role, resource, action)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Super admins full access
CREATE POLICY "Super admins can manage all permissions"
  ON public.permissions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Tenant admins can manage permissions for their tenant
CREATE POLICY "Tenant admins can manage tenant permissions"
  ON public.permissions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

-- All tenant members can view permissions (needed for UI checks)
CREATE POLICY "Tenant members can view permissions"
  ON public.permissions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'));

-- Trigger for updated_at
CREATE TRIGGER update_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Helper function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID, _tenant_id UUID, _resource TEXT, _action TEXT DEFAULT 'edit'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permissions p
    JOIN public.user_roles ur ON ur.role = p.role AND ur.user_id = _user_id
      AND (ur.tenant_id = _tenant_id OR ur.tenant_id IS NULL)
    WHERE p.tenant_id = _tenant_id
      AND p.resource = _resource
      AND p.action = _action
      AND p.is_allowed = true
  )
$$;
