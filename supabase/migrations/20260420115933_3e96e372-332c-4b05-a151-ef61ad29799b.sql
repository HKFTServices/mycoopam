DROP POLICY IF EXISTS "Tenant admins manage their SEO" ON public.tenant_seo;

CREATE POLICY "Admins insert SEO"
  ON public.tenant_seo FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  );

CREATE POLICY "Admins update SEO"
  ON public.tenant_seo FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  );

CREATE POLICY "Admins delete SEO"
  ON public.tenant_seo FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  );