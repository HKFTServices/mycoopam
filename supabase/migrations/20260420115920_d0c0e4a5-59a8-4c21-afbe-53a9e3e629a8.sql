CREATE TABLE public.tenant_seo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  og_image_url TEXT,
  keywords TEXT,
  generated_by_ai BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_seo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SEO is publicly readable"
  ON public.tenant_seo FOR SELECT
  USING (true);

CREATE POLICY "Tenant admins manage their SEO"
  ON public.tenant_seo FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  );

CREATE TRIGGER update_tenant_seo_updated_at
  BEFORE UPDATE ON public.tenant_seo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP FUNCTION IF EXISTS public.get_tenant_branding_by_slug(text);

CREATE FUNCTION public.get_tenant_branding_by_slug(p_slug text)
 RETURNS TABLE(
   tenant_id uuid,
   tenant_name text,
   legal_name text,
   logo_url text,
   seo_title text,
   seo_description text,
   seo_og_image_url text,
   seo_keywords text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    e.name AS legal_name,
    tc.logo_url,
    ts.title,
    ts.description,
    ts.og_image_url,
    ts.keywords
  FROM public.tenants t
  LEFT JOIN public.tenant_configuration tc ON tc.tenant_id = t.id
  LEFT JOIN public.entities e ON e.id = tc.legal_entity_id
  LEFT JOIN public.tenant_seo ts ON ts.tenant_id = t.id
  WHERE t.slug = p_slug
    AND t.is_active = true
  LIMIT 1;
$function$;