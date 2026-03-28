
-- SLA Fee Plans: stores the two option templates (editable by head office)
CREATE TABLE public.sla_fee_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE,  -- 'option_a' or 'option_b'
  plan_label TEXT NOT NULL,        -- 'Option A' or 'Option B'
  setup_fee_excl_vat NUMERIC NOT NULL DEFAULT 0,
  deposit_fee_pct NUMERIC NOT NULL DEFAULT 0,
  switch_transfer_withdrawal_fee_pct NUMERIC NOT NULL DEFAULT 0,
  tpv_tier1_threshold NUMERIC NOT NULL DEFAULT 40000000,
  tpv_tier1_pct_pa NUMERIC NOT NULL DEFAULT 0,
  tpv_tier2_threshold NUMERIC NOT NULL DEFAULT 100000000,
  tpv_tier2_pct_pa NUMERIC NOT NULL DEFAULT 0,
  tpv_tier3_pct_pa NUMERIC NOT NULL DEFAULT 0,
  additional_inclusions TEXT,
  additional_exclusions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the two default plans from the SLA document
INSERT INTO public.sla_fee_plans (plan_code, plan_label, setup_fee_excl_vat, deposit_fee_pct, switch_transfer_withdrawal_fee_pct, tpv_tier1_threshold, tpv_tier1_pct_pa, tpv_tier2_threshold, tpv_tier2_pct_pa, tpv_tier3_pct_pa)
VALUES
  ('option_a', 'Option A', 2500, 0.5, 0.25, 40000000, 1.0, 100000000, 0.75, 0.5),
  ('option_b', 'Option B', 25000, 0.4, 0.2, 40000000, 0.8, 100000000, 0.65, 0.4);

-- Tenant SLA: records which plan a tenant selected and their signature
CREATE TABLE public.tenant_sla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sla_fee_plan_id UUID NOT NULL REFERENCES public.sla_fee_plans(id),
  registration_number TEXT,
  signed_by_name TEXT,
  signature_data TEXT,           -- base64 signature image
  signed_at TIMESTAMPTZ,
  setup_fee_paid BOOLEAN NOT NULL DEFAULT false,
  setup_fee_paid_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, active, overdue, cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- RLS
ALTER TABLE public.sla_fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sla ENABLE ROW LEVEL SECURITY;

-- sla_fee_plans: readable by anyone (needed for registration), writable only via service role
CREATE POLICY "Anyone can read active fee plans" ON public.sla_fee_plans
  FOR SELECT USING (is_active = true);

-- tenant_sla: tenant admins can read their own, head office manages via service role
CREATE POLICY "Users can read own tenant SLA" ON public.tenant_sla
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Allow insert during registration (before user has roles)
CREATE POLICY "Allow insert tenant SLA" ON public.tenant_sla
  FOR INSERT TO authenticated
  WITH CHECK (true);
