
CREATE TABLE public.legacy_gl_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) NOT NULL,
  transaction_type_id TEXT NOT NULL,
  transaction_type_name TEXT NOT NULL,
  entry_type_id TEXT NOT NULL,
  entry_type_name TEXT NOT NULL,
  gl_account_id UUID REFERENCES public.gl_accounts(id),
  control_account_id UUID REFERENCES public.control_accounts(id),
  split_rule JSONB DEFAULT NULL,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, transaction_type_id, entry_type_id)
);

ALTER TABLE public.legacy_gl_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage legacy_gl_mappings"
  ON public.legacy_gl_mappings
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER update_legacy_gl_mappings_updated_at
  BEFORE UPDATE ON public.legacy_gl_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
