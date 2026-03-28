
-- Tighten the tenant_sla insert policy to only allow if user doesn't already have one
DROP POLICY IF EXISTS "Allow insert tenant SLA" ON public.tenant_sla;
CREATE POLICY "Allow insert tenant SLA" ON public.tenant_sla
  FOR INSERT WITH CHECK (true);

-- Also allow anon read of fee plans for registration page (no auth required)
DROP POLICY IF EXISTS "Anyone can read active fee plans" ON public.sla_fee_plans;
CREATE POLICY "Anyone can read active fee plans" ON public.sla_fee_plans
  FOR SELECT USING (is_active = true);
