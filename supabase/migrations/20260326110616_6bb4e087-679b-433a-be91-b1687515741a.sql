-- Create tenant_features table for Head Office feature toggling
CREATE TABLE public.tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, feature_key)
);

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_features_select" ON public.tenant_features FOR SELECT USING (true);
CREATE POLICY "tenant_features_insert" ON public.tenant_features FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant_features_update" ON public.tenant_features FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant_features_delete" ON public.tenant_features FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenant_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();