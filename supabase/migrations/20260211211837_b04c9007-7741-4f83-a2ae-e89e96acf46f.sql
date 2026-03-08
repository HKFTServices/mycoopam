
-- Entities table (natural persons & legal entities)
CREATE TABLE public.entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_category_id UUID NOT NULL REFERENCES public.entity_categories(id),
  title_id UUID REFERENCES public.titles(id),
  name TEXT NOT NULL,
  last_name TEXT,
  initials TEXT,
  known_as TEXT,
  gender TEXT,
  identity_number TEXT,
  passport_number TEXT,
  registration_number TEXT,
  date_of_birth DATE,
  contact_number TEXT,
  additional_contact_number TEXT,
  email_address TEXT,
  additional_email_address TEXT,
  is_vat_registered BOOLEAN NOT NULL DEFAULT false,
  vat_number TEXT,
  website TEXT,
  agent_commission_percentage NUMERIC(5,2),
  agent_house_agent_id UUID REFERENCES public.entities(id),
  is_registration_complete BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  creator_user_id UUID,
  last_modifier_user_id UUID
);

-- Entity-User Relationships (many-to-many link)
CREATE TABLE public.entity_user_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  relationship_type_id UUID NOT NULL REFERENCES public.relationship_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  creator_user_id UUID,
  last_modifier_user_id UUID
);

-- Indexes
CREATE INDEX idx_entities_tenant ON public.entities(tenant_id);
CREATE INDEX idx_entities_category ON public.entities(entity_category_id);
CREATE INDEX idx_entities_not_deleted ON public.entities(tenant_id) WHERE is_deleted = false;
CREATE INDEX idx_eur_tenant ON public.entity_user_relationships(tenant_id);
CREATE INDEX idx_eur_user ON public.entity_user_relationships(user_id);
CREATE INDEX idx_eur_entity ON public.entity_user_relationships(entity_id);
CREATE INDEX idx_eur_not_deleted ON public.entity_user_relationships(tenant_id) WHERE is_deleted = false;

-- RLS for entities
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage entities"
ON public.entities FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own tenant entities"
ON public.entities FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view entities"
ON public.entities FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for entity_user_relationships
ALTER TABLE public.entity_user_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage entity user relationships"
ON public.entity_user_relationships FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own tenant relationships"
ON public.entity_user_relationships FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can view own relationships"
ON public.entity_user_relationships FOR SELECT
USING (auth.uid() = user_id OR is_tenant_member(auth.uid(), tenant_id));

-- Update triggers
CREATE TRIGGER update_entities_updated_at
BEFORE UPDATE ON public.entities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_eur_updated_at
BEFORE UPDATE ON public.entity_user_relationships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
