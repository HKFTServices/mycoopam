CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_slug(p_slug text)
RETURNS TABLE(tenant_id uuid, tenant_name text, legal_name text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    e.name AS legal_name,
    tc.logo_url
  FROM public.tenants t
  LEFT JOIN public.tenant_configuration tc ON tc.tenant_id = t.id
  LEFT JOIN public.entities e ON e.id = tc.legal_entity_id
  WHERE t.slug = p_slug
    AND t.is_active = true
  LIMIT 1;
$$;