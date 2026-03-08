
-- Entity type enum: 1=natural_person, 2=legal_entity
CREATE TYPE public.entity_type AS ENUM ('natural_person', 'legal_entity');

-- Entity Categories (Natural Person, Company, Trust, etc.)
CREATE TABLE public.entity_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.entity_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view entity categories"
  ON public.entity_categories FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage entity categories"
  ON public.entity_categories FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_entity_categories_updated_at
  BEFORE UPDATE ON public.entity_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Document Types
CREATE TABLE public.document_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  comment_instruction TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view document types"
  ON public.document_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage document types"
  ON public.document_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_document_types_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Relationship Types (Myself, Director of Company, Trustee, etc.)
CREATE TABLE public.relationship_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_category_id UUID NOT NULL REFERENCES public.entity_categories(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view relationship types"
  ON public.relationship_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage relationship types"
  ON public.relationship_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_relationship_types_updated_at
  BEFORE UPDATE ON public.relationship_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Document-Entity Requirements (which docs are needed for which relationship type)
CREATE TABLE public.document_entity_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  relationship_type_id UUID NOT NULL REFERENCES public.relationship_types(id) ON DELETE CASCADE,
  is_required_for_registration BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, document_type_id, relationship_type_id)
);

ALTER TABLE public.document_entity_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view document requirements"
  ON public.document_entity_requirements FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage document requirements"
  ON public.document_entity_requirements FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_document_entity_requirements_updated_at
  BEFORE UPDATE ON public.document_entity_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
