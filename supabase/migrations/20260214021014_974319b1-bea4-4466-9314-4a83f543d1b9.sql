
-- Drop existing restrictive policies on entity_accounts
DROP POLICY IF EXISTS "Super admins can manage all entity_accounts" ON public.entity_accounts;
DROP POLICY IF EXISTS "Tenant admins can manage tenant entity_accounts" ON public.entity_accounts;
DROP POLICY IF EXISTS "Users can view own entity_accounts" ON public.entity_accounts;
DROP POLICY IF EXISTS "Users can insert own entity_accounts" ON public.entity_accounts;

-- Recreate as PERMISSIVE (any one matching = access granted)
CREATE POLICY "Super admins can manage all entity_accounts"
ON public.entity_accounts FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant entity_accounts"
ON public.entity_accounts FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

-- Fix the self-referencing bug: ue.entity_id should match entity_accounts.entity_id
CREATE POLICY "Users can view own entity_accounts"
ON public.entity_accounts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_entity_relationships ue
    WHERE ue.entity_id = entity_accounts.entity_id AND ue.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own entity_accounts"
ON public.entity_accounts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_entity_relationships ue
    WHERE ue.entity_id = entity_accounts.entity_id AND ue.user_id = auth.uid()
  )
);
