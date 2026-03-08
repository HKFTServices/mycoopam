
-- Create entity_documents table for legacy imported documents
CREATE TABLE public.entity_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  document_type_id UUID REFERENCES public.document_types(id),
  description TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  document_date DATE,
  legacy_id TEXT,
  legacy_document_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  creator_user_id UUID,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.entity_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all entity_documents"
  ON public.entity_documents FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant entity_documents"
  ON public.entity_documents FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view entity_documents"
  ON public.entity_documents FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Index for lookups
CREATE INDEX idx_entity_documents_entity_id ON public.entity_documents(entity_id);
CREATE INDEX idx_entity_documents_tenant_id ON public.entity_documents(tenant_id);
