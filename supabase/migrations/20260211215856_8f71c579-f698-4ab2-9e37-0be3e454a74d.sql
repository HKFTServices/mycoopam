
-- 1. Entities table (mirrors legacy Entities)
CREATE TABLE public.entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  initials TEXT,
  known_as TEXT,
  name TEXT NOT NULL,
  last_name TEXT,
  gender TEXT,
  identity_number TEXT,
  passport_number TEXT,
  registration_number TEXT,
  contact_number TEXT,
  additional_contact_number TEXT,
  email_address TEXT,
  additional_email_address TEXT,
  is_vat_registered BOOLEAN NOT NULL DEFAULT false,
  vat_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  title_id UUID REFERENCES public.titles(id),
  language_code TEXT NOT NULL DEFAULT 'en',
  date_of_birth DATE,
  entity_category_id UUID REFERENCES public.entity_categories(id),
  website TEXT,
  agent_commission_percentage NUMERIC DEFAULT 0,
  agent_house_agent_id UUID,
  is_registration_complete BOOLEAN NOT NULL DEFAULT false,
  legacy_client_account_id TEXT,
  legacy_user_id TEXT,
  creator_user_id UUID,
  last_modifier_user_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. User-Entity relationship (links auth users to entities)
CREATE TABLE public.user_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type_id UUID REFERENCES public.relationship_types(id),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_id, relationship_type_id)
);

-- 3. Entity Accounts (membership, customer, supplier, referral house)
CREATE TABLE public.entity_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  entity_account_type_id UUID NOT NULL REFERENCES public.entity_account_types(id),
  account_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending_activation',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_accounts ENABLE ROW LEVEL SECURITY;

-- RLS: Entities
CREATE POLICY "Super admins can manage all entities"
  ON public.entities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant entities"
  ON public.entities FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can view entities they are linked to"
  ON public.entities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_entities ue
      WHERE ue.entity_id = id AND ue.user_id = auth.uid()
    )
    OR is_tenant_member(auth.uid(), tenant_id)
  );

CREATE POLICY "Users can insert own entities"
  ON public.entities FOR INSERT
  WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY "Users can update entities they created"
  ON public.entities FOR UPDATE
  USING (creator_user_id = auth.uid());

-- RLS: User Entities
CREATE POLICY "Super admins can manage all user_entities"
  ON public.user_entities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant user_entities"
  ON public.user_entities FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can manage own user_entities"
  ON public.user_entities FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: Entity Accounts
CREATE POLICY "Super admins can manage all entity_accounts"
  ON public.entity_accounts FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant entity_accounts"
  ON public.entity_accounts FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can view own entity_accounts"
  ON public.entity_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_entities ue
      WHERE ue.entity_id = entity_id AND ue.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own entity_accounts"
  ON public.entity_accounts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_entities ue
      WHERE ue.entity_id = entity_id AND ue.user_id = auth.uid()
    )
  );

-- Update triggers
CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_user_entities_updated_at
  BEFORE UPDATE ON public.user_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_entity_accounts_updated_at
  BEFORE UPDATE ON public.entity_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
