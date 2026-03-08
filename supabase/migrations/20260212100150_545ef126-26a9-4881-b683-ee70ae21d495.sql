
-- Legacy ID mapping table for data migration
-- Stores mappings from legacy SQL Server IDs to new UUIDs
CREATE TABLE public.legacy_id_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  table_name TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  new_id UUID NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  import_batch TEXT,
  notes TEXT,
  UNIQUE(tenant_id, table_name, legacy_id)
);

-- Index for fast lookups during subsequent import phases
CREATE INDEX idx_legacy_mappings_lookup ON public.legacy_id_mappings(tenant_id, table_name, legacy_id);
CREATE INDEX idx_legacy_mappings_new_id ON public.legacy_id_mappings(new_id);

-- Enable RLS
ALTER TABLE public.legacy_id_mappings ENABLE ROW LEVEL SECURITY;

-- Only super admins and tenant admins can manage migration data
CREATE POLICY "Super admins can manage legacy mappings"
  ON public.legacy_id_mappings FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own legacy mappings"
  ON public.legacy_id_mappings FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view legacy mappings"
  ON public.legacy_id_mappings FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));
