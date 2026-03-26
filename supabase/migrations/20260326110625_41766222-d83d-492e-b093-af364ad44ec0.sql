CREATE OR REPLACE FUNCTION public.is_feature_enabled(_tenant_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.tenant_features WHERE tenant_id = _tenant_id AND feature_key = _feature_key),
    true
  )
$$;