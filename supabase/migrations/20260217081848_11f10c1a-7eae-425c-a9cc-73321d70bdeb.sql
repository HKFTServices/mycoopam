
-- Fix ALL entities policies to be PERMISSIVE (default PostgreSQL behavior)
-- The issue is ALL policies are RESTRICTIVE, which means they ALL must pass (AND logic)

DROP POLICY IF EXISTS "Super admins can manage all entities" ON public.entities;
DROP POLICY IF EXISTS "Tenant admins can manage tenant entities" ON public.entities;
DROP POLICY IF EXISTS "Users can insert own entities" ON public.entities;
DROP POLICY IF EXISTS "Users can update entities they created" ON public.entities;
DROP POLICY IF EXISTS "Users can view entities they are linked to" ON public.entities;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Super admins can manage all entities"
ON public.entities FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can manage tenant entities"
ON public.entities FOR ALL
TO authenticated
USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE POLICY "Users can insert own entities"
ON public.entities FOR INSERT
TO authenticated
WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY "Users can update entities they created"
ON public.entities FOR UPDATE
TO authenticated
USING (creator_user_id = auth.uid());

CREATE POLICY "Users can view entities they are linked to"
ON public.entities FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_entity_relationships ue
    WHERE ue.entity_id = entities.id AND ue.user_id = auth.uid()
  )
  OR is_tenant_member(auth.uid(), tenant_id)
);
