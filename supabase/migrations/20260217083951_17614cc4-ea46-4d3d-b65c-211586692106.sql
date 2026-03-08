
CREATE OR REPLACE FUNCTION public.get_tenant_branding()
 RETURNS TABLE(tenant_id uuid, tenant_name text, logo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id AS tenant_id, 
         COALESCE(e.name, t.name) AS tenant_name, 
         tc.logo_url
  FROM public.tenants t
  LEFT JOIN public.tenant_configuration tc ON tc.tenant_id = t.id
  LEFT JOIN public.entities e ON e.id = tc.legal_entity_id
  WHERE t.is_active = true
  ORDER BY t.name
  LIMIT 10;
$function$;
