
-- ============================================================
-- MAM Reference / Config Tables (with tenant_id)
-- ============================================================

-- si_section
CREATE TABLE public.si_section (
  section_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  section_code text NOT NULL,
  section_name text NOT NULL,
  description text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_category_group
CREATE TABLE public.si_category_group (
  category_group_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  group_code text NOT NULL,
  group_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_item_category
CREATE TABLE public.si_item_category (
  category_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  section_id uuid REFERENCES public.si_section(section_id),
  category_code text NOT NULL,
  category_name text NOT NULL,
  category_group text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_category_attribute
CREATE TABLE public.si_category_attribute (
  category_attribute_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  category_id uuid NOT NULL REFERENCES public.si_item_category(category_id),
  attribute_code text NOT NULL,
  attribute_name text NOT NULL,
  data_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_brand
CREATE TABLE public.si_brand (
  brand_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  brand_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_item_model
CREATE TABLE public.si_item_model (
  item_model_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  category_id uuid NOT NULL REFERENCES public.si_item_category(category_id),
  brand_id uuid REFERENCES public.si_brand(brand_id),
  model_name text NOT NULL,
  model_number text,
  typical_new_value numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_contribution_plan
CREATE TABLE public.si_contribution_plan (
  contribution_plan_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  plan_code text NOT NULL,
  plan_name text NOT NULL,
  contribution_method text NOT NULL,
  contribution_rate numeric,
  fixed_monthly_contribution numeric,
  max_contribution numeric,
  assistance_multiplier numeric NOT NULL DEFAULT 1,
  max_assistance_cap numeric,
  currency_code text NOT NULL DEFAULT 'ZAR',
  category_id uuid REFERENCES public.si_item_category(category_id),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_coop_structure
CREATE TABLE public.si_coop_structure (
  coop_structure_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  admin_fee_percent numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_dashboard_note
CREATE TABLE public.si_dashboard_note (
  dashboard_note_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  section_key text NOT NULL,
  note_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_projection_assumption
CREATE TABLE public.si_projection_assumption (
  projection_assumption_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  yield_pa numeric NOT NULL DEFAULT 0,
  contribution_esc_perc numeric NOT NULL DEFAULT 0,
  total_period_months integer NOT NULL DEFAULT 120,
  interval_months integer NOT NULL DEFAULT 12,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_pool (maps to MyCoop pools table via pool_id FK)
CREATE TABLE public.si_pool (
  si_pool_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pool_id uuid REFERENCES public.pools(id),
  pool_code text NOT NULL,
  pool_name text NOT NULL,
  cont_split_perc numeric NOT NULL DEFAULT 0,
  assistance_cap_perc numeric NOT NULL DEFAULT 0,
  cap_multiplier_member numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_pool_category
CREATE TABLE public.si_pool_category (
  pool_category_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pool_id uuid NOT NULL REFERENCES public.si_pool(si_pool_id),
  category_id uuid NOT NULL REFERENCES public.si_item_category(category_id),
  allocation_perc numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_member_asset (entity_id now UUID → entities table)
CREATE TABLE public.si_member_asset (
  member_asset_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_id uuid NOT NULL REFERENCES public.entities(id),
  category_id uuid NOT NULL REFERENCES public.si_item_category(category_id),
  category_group_id uuid REFERENCES public.si_category_group(category_group_id),
  brand_id uuid REFERENCES public.si_brand(brand_id),
  item_model_id uuid REFERENCES public.si_item_model(item_model_id),
  asset_display_name text NOT NULL,
  declared_value numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  year_model integer,
  currency_code text NOT NULL DEFAULT 'ZAR',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_member_asset_attribute_value
CREATE TABLE public.si_member_asset_attribute_value (
  member_asset_attribute_value_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  member_asset_id uuid NOT NULL REFERENCES public.si_member_asset(member_asset_id) ON DELETE CASCADE,
  category_attribute_id uuid NOT NULL REFERENCES public.si_category_attribute(category_attribute_id),
  value_text text,
  value_number numeric,
  value_date date,
  value_bit boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_member_account_balance (entity_id now UUID)
CREATE TABLE public.si_member_account_balance (
  member_account_balance_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_id uuid NOT NULL REFERENCES public.entities(id),
  member_account_balance numeric NOT NULL DEFAULT 0,
  solidarity_pool_balance numeric NOT NULL DEFAULT 0,
  health_reserve_balance numeric NOT NULL DEFAULT 0,
  reserve_fund_balance numeric NOT NULL DEFAULT 0,
  grants_received_member numeric NOT NULL DEFAULT 0,
  grants_received_solidarity numeric NOT NULL DEFAULT 0,
  grants_received_health numeric NOT NULL DEFAULT 0,
  grants_received_reserve numeric NOT NULL DEFAULT 0,
  grants_paid_coop_total numeric NOT NULL DEFAULT 0,
  coop_total_account_balance numeric NOT NULL DEFAULT 0,
  coop_total_solidarity_pool numeric NOT NULL DEFAULT 0,
  coop_total_health_reserve numeric NOT NULL DEFAULT 0,
  coop_total_reserve_fund numeric NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'ZAR',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- si_quote (entity_id now UUID)
CREATE TABLE public.si_quote (
  quote_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_id uuid NOT NULL REFERENCES public.entities(id),
  quote_number text NOT NULL,
  quote_status text NOT NULL DEFAULT 'draft',
  currency_code text NOT NULL DEFAULT 'ZAR',
  notes text,
  submitted_at_utc timestamptz,
  accepted_at_utc timestamptz,
  expires_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

-- si_quote_item
CREATE TABLE public.si_quote_item (
  quote_item_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  quote_id uuid NOT NULL REFERENCES public.si_quote(quote_id) ON DELETE CASCADE,
  member_asset_id uuid REFERENCES public.si_member_asset(member_asset_id),
  category_id uuid REFERENCES public.si_item_category(category_id),
  brand_id uuid REFERENCES public.si_brand(brand_id),
  item_model_id uuid REFERENCES public.si_item_model(item_model_id),
  contribution_plan_id uuid REFERENCES public.si_contribution_plan(contribution_plan_id),
  asset_display_name text,
  declared_value numeric NOT NULL DEFAULT 0,
  monthly_contribution numeric NOT NULL DEFAULT 0,
  assistance_limit numeric NOT NULL DEFAULT 0,
  assistance_cap_applied boolean NOT NULL DEFAULT false,
  license_plate text,
  year_model integer,
  notes text,
  is_accepted boolean NOT NULL DEFAULT false,
  accepted_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

-- si_quote_item_attribute_value
CREATE TABLE public.si_quote_item_attribute_value (
  quote_item_attribute_value_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  quote_item_id uuid NOT NULL REFERENCES public.si_quote_item(quote_item_id) ON DELETE CASCADE,
  category_attribute_id uuid NOT NULL REFERENCES public.si_category_attribute(category_attribute_id),
  value_text text,
  value_number numeric,
  value_date date,
  value_bit boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS Policies for all si_ tables
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.si_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_category_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_item_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_category_attribute ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_item_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_contribution_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_coop_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_dashboard_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_projection_assumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_pool_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_member_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_member_asset_attribute_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_member_account_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_quote ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_quote_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_quote_item_attribute_value ENABLE ROW LEVEL SECURITY;

-- Macro: for each si_ table, create 3 policies:
-- 1. Super admins full access
-- 2. Tenant admins full access
-- 3. Tenant members read access

-- si_section
CREATE POLICY "Super admins manage si_section" ON public.si_section FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_section" ON public.si_section FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_section" ON public.si_section FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_category_group
CREATE POLICY "Super admins manage si_category_group" ON public.si_category_group FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_category_group" ON public.si_category_group FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_category_group" ON public.si_category_group FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_item_category
CREATE POLICY "Super admins manage si_item_category" ON public.si_item_category FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_item_category" ON public.si_item_category FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_item_category" ON public.si_item_category FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_category_attribute
CREATE POLICY "Super admins manage si_category_attribute" ON public.si_category_attribute FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_category_attribute" ON public.si_category_attribute FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_category_attribute" ON public.si_category_attribute FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_brand
CREATE POLICY "Super admins manage si_brand" ON public.si_brand FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_brand" ON public.si_brand FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_brand" ON public.si_brand FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_item_model
CREATE POLICY "Super admins manage si_item_model" ON public.si_item_model FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_item_model" ON public.si_item_model FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_item_model" ON public.si_item_model FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_contribution_plan
CREATE POLICY "Super admins manage si_contribution_plan" ON public.si_contribution_plan FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_contribution_plan" ON public.si_contribution_plan FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_contribution_plan" ON public.si_contribution_plan FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_coop_structure
CREATE POLICY "Super admins manage si_coop_structure" ON public.si_coop_structure FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_coop_structure" ON public.si_coop_structure FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_coop_structure" ON public.si_coop_structure FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_dashboard_note
CREATE POLICY "Super admins manage si_dashboard_note" ON public.si_dashboard_note FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_dashboard_note" ON public.si_dashboard_note FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_dashboard_note" ON public.si_dashboard_note FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_projection_assumption
CREATE POLICY "Super admins manage si_projection_assumption" ON public.si_projection_assumption FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_projection_assumption" ON public.si_projection_assumption FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_projection_assumption" ON public.si_projection_assumption FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_pool
CREATE POLICY "Super admins manage si_pool" ON public.si_pool FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_pool" ON public.si_pool FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_pool" ON public.si_pool FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_pool_category
CREATE POLICY "Super admins manage si_pool_category" ON public.si_pool_category FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_pool_category" ON public.si_pool_category FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Tenant members view si_pool_category" ON public.si_pool_category FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- si_member_asset (members can also manage their own assets)
CREATE POLICY "Super admins manage si_member_asset" ON public.si_member_asset FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_member_asset" ON public.si_member_asset FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users view own si_member_asset" ON public.si_member_asset FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_member_asset.entity_id AND ue.user_id = auth.uid()));
CREATE POLICY "Users manage own si_member_asset" ON public.si_member_asset FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_member_asset.entity_id AND ue.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_member_asset.entity_id AND ue.user_id = auth.uid()));
CREATE POLICY "Tenant members view si_member_asset" ON public.si_member_asset FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

-- si_member_asset_attribute_value
CREATE POLICY "Super admins manage si_member_asset_attribute_value" ON public.si_member_asset_attribute_value FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_member_asset_attribute_value" ON public.si_member_asset_attribute_value FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users manage own asset attributes" ON public.si_member_asset_attribute_value FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM si_member_asset ma JOIN user_entity_relationships ue ON ue.entity_id = ma.entity_id WHERE ma.member_asset_id = si_member_asset_attribute_value.member_asset_id AND ue.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM si_member_asset ma JOIN user_entity_relationships ue ON ue.entity_id = ma.entity_id WHERE ma.member_asset_id = si_member_asset_attribute_value.member_asset_id AND ue.user_id = auth.uid()));

-- si_member_account_balance
CREATE POLICY "Super admins manage si_member_account_balance" ON public.si_member_account_balance FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_member_account_balance" ON public.si_member_account_balance FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users view own si_member_account_balance" ON public.si_member_account_balance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_member_account_balance.entity_id AND ue.user_id = auth.uid()));

-- si_quote
CREATE POLICY "Super admins manage si_quote" ON public.si_quote FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_quote" ON public.si_quote FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users manage own si_quote" ON public.si_quote FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_quote.entity_id AND ue.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM user_entity_relationships ue WHERE ue.entity_id = si_quote.entity_id AND ue.user_id = auth.uid()));

-- si_quote_item
CREATE POLICY "Super admins manage si_quote_item" ON public.si_quote_item FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_quote_item" ON public.si_quote_item FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users manage own si_quote_item" ON public.si_quote_item FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM si_quote q JOIN user_entity_relationships ue ON ue.entity_id = q.entity_id WHERE q.quote_id = si_quote_item.quote_id AND ue.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM si_quote q JOIN user_entity_relationships ue ON ue.entity_id = q.entity_id WHERE q.quote_id = si_quote_item.quote_id AND ue.user_id = auth.uid()));

-- si_quote_item_attribute_value
CREATE POLICY "Super admins manage si_quote_item_attribute_value" ON public.si_quote_item_attribute_value FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Tenant admins manage si_quote_item_attribute_value" ON public.si_quote_item_attribute_value FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id)) WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
CREATE POLICY "Users manage own quote item attributes" ON public.si_quote_item_attribute_value FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM si_quote_item qi JOIN si_quote q ON q.quote_id = qi.quote_id JOIN user_entity_relationships ue ON ue.entity_id = q.entity_id WHERE qi.quote_item_id = si_quote_item_attribute_value.quote_item_id AND ue.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM si_quote_item qi JOIN si_quote q ON q.quote_id = qi.quote_id JOIN user_entity_relationships ue ON ue.entity_id = q.entity_id WHERE qi.quote_item_id = si_quote_item_attribute_value.quote_item_id AND ue.user_id = auth.uid()));
