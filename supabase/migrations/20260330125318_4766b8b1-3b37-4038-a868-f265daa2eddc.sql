
-- Drop the overly permissive ALL policy and create specific ones
DROP POLICY IF EXISTS "Tenant admins can manage referral plans" ON public.referral_plans;

CREATE POLICY "Tenant admins can insert referral plans"
  ON public.referral_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) 
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Tenant admins can update referral plans"
  ON public.referral_plans FOR UPDATE TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) 
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) 
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Tenant admins can delete referral plans"
  ON public.referral_plans FOR DELETE TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) 
    OR public.has_role(auth.uid(), 'super_admin')
  );
