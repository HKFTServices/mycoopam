
-- Allow tenant admins to manage document_types for their own tenant
CREATE POLICY "Tenant admins can manage own document types"
ON public.document_types
FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

-- Allow tenant admins to manage document_entity_requirements for their own tenant
CREATE POLICY "Tenant admins can manage own document requirements"
ON public.document_entity_requirements
FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

-- Allow tenant admins to manage terms_conditions for their own tenant
CREATE POLICY "Tenant admins can manage own terms"
ON public.terms_conditions
FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));
