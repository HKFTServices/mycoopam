
-- Add monthly fee and plan type columns to sla_fee_plans
ALTER TABLE public.sla_fee_plans
  ADD COLUMN IF NOT EXISTS monthly_fee_excl_vat numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'full';

-- Insert Option C: Basic Administration plan
INSERT INTO public.sla_fee_plans (
  plan_code, plan_label, plan_type,
  setup_fee_excl_vat, monthly_fee_excl_vat,
  deposit_fee_pct, switch_transfer_withdrawal_fee_pct,
  tpv_tier1_pct_pa, tpv_tier1_threshold,
  tpv_tier2_pct_pa, tpv_tier2_threshold,
  tpv_tier3_pct_pa,
  is_active
) VALUES (
  'C', 'Option C', 'basic',
  0, 599,
  0, 0,
  0, 0,
  0, 0,
  0,
  true
);

-- Update existing plans to plan_type = 'full'
UPDATE public.sla_fee_plans SET plan_type = 'full' WHERE plan_code IN ('A', 'B');
