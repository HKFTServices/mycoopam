
-- ============================================
-- Remove tenant_id from global reference tables
-- Tables: titles, banks, bank_account_types, entity_categories, relationship_types, entity_account_types
-- These are managed by super_admin and shared across all tenants
-- ============================================

-- 1. DROP existing RLS policies on these tables

-- titles
DROP POLICY IF EXISTS "Super admins can manage titles" ON public.titles;
DROP POLICY IF EXISTS "Tenant members can view titles" ON public.titles;

-- banks
DROP POLICY IF EXISTS "Super admins can manage banks" ON public.banks;
DROP POLICY IF EXISTS "Tenant members can view banks" ON public.banks;

-- bank_account_types
DROP POLICY IF EXISTS "Super admins can manage bank account types" ON public.bank_account_types;
DROP POLICY IF EXISTS "Tenant members can view bank account types" ON public.bank_account_types;

-- entity_categories
DROP POLICY IF EXISTS "Super admins can manage entity categories" ON public.entity_categories;
DROP POLICY IF EXISTS "Tenant members can view entity categories" ON public.entity_categories;

-- relationship_types
DROP POLICY IF EXISTS "Super admins can manage relationship types" ON public.relationship_types;
DROP POLICY IF EXISTS "Tenant members can view relationship types" ON public.relationship_types;

-- entity_account_types
DROP POLICY IF EXISTS "Super admins can manage entity account types" ON public.entity_account_types;
DROP POLICY IF EXISTS "Tenant members can view entity account types" ON public.entity_account_types;

-- 2. DROP tenant_id foreign key constraints then columns

ALTER TABLE public.titles DROP CONSTRAINT IF EXISTS titles_tenant_id_fkey;
ALTER TABLE public.titles DROP COLUMN tenant_id;

ALTER TABLE public.banks DROP CONSTRAINT IF EXISTS banks_tenant_id_fkey;
ALTER TABLE public.banks DROP COLUMN tenant_id;

ALTER TABLE public.bank_account_types DROP CONSTRAINT IF EXISTS bank_account_types_tenant_id_fkey;
ALTER TABLE public.bank_account_types DROP COLUMN tenant_id;

ALTER TABLE public.entity_categories DROP CONSTRAINT IF EXISTS entity_categories_tenant_id_fkey;
ALTER TABLE public.entity_categories DROP COLUMN tenant_id;

ALTER TABLE public.relationship_types DROP CONSTRAINT IF EXISTS relationship_types_tenant_id_fkey;
ALTER TABLE public.relationship_types DROP COLUMN tenant_id;

ALTER TABLE public.entity_account_types DROP CONSTRAINT IF EXISTS entity_account_types_tenant_id_fkey;
ALTER TABLE public.entity_account_types DROP COLUMN tenant_id;

-- 3. CREATE new simplified RLS policies
-- Anyone authenticated can view, only super_admins can manage

-- titles
CREATE POLICY "Anyone can view titles"
ON public.titles FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage titles"
ON public.titles FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- banks
CREATE POLICY "Anyone can view banks"
ON public.banks FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage banks"
ON public.banks FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- bank_account_types
CREATE POLICY "Anyone can view bank account types"
ON public.bank_account_types FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage bank account types"
ON public.bank_account_types FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- entity_categories
CREATE POLICY "Anyone can view entity categories"
ON public.entity_categories FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage entity categories"
ON public.entity_categories FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- relationship_types
CREATE POLICY "Anyone can view relationship types"
ON public.relationship_types FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage relationship types"
ON public.relationship_types FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- entity_account_types
CREATE POLICY "Anyone can view entity account types"
ON public.entity_account_types FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage entity account types"
ON public.entity_account_types FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
