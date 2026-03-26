-- Add tenant_id column (nullable first)
ALTER TABLE public.entity_account_types ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- Assign existing rows to the only tenant
UPDATE public.entity_account_types SET tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662' WHERE tenant_id IS NULL;

-- Make it NOT NULL
ALTER TABLE public.entity_account_types ALTER COLUMN tenant_id SET NOT NULL;

-- Update RLS policies
DROP POLICY IF EXISTS "Anyone can view entity_account_types" ON public.entity_account_types;
DROP POLICY IF EXISTS "Admins can manage entity_account_types" ON public.entity_account_types;
DROP POLICY IF EXISTS "Allow public read entity_account_types" ON public.entity_account_types;
DROP POLICY IF EXISTS "entity_account_types_select" ON public.entity_account_types;
DROP POLICY IF EXISTS "entity_account_types_insert" ON public.entity_account_types;
DROP POLICY IF EXISTS "entity_account_types_update" ON public.entity_account_types;
DROP POLICY IF EXISTS "entity_account_types_delete" ON public.entity_account_types;

CREATE POLICY "entity_account_types_select" ON public.entity_account_types FOR SELECT USING (true);

CREATE POLICY "entity_account_types_insert" ON public.entity_account_types FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "entity_account_types_update" ON public.entity_account_types FOR UPDATE TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "entity_account_types_delete" ON public.entity_account_types FOR DELETE TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));