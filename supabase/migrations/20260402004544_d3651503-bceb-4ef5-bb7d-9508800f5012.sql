
-- Add modular service fee columns to sla_fee_plans
ALTER TABLE public.sla_fee_plans
  ADD COLUMN IF NOT EXISTS membership_admin_fee numeric NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS loans_fee numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS debit_orders_fee numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS accounting_fee numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS includes_pooling boolean NOT NULL DEFAULT false;

-- Add selected_services to tenant_sla
ALTER TABLE public.tenant_sla
  ADD COLUMN IF NOT EXISTS selected_services jsonb NOT NULL DEFAULT '["membership_admin","loans","debit_orders","accounting"]'::jsonb;

-- Update Option C → Starter (no pooling, R500 setup)
UPDATE public.sla_fee_plans
SET plan_code = 'starter',
    plan_label = 'Starter',
    plan_type = 'basic',
    setup_fee_excl_vat = 500,
    monthly_fee_excl_vat = 0,
    includes_pooling = false,
    membership_admin_fee = 250,
    loans_fee = 50,
    debit_orders_fee = 50,
    accounting_fee = 50,
    updated_at = now()
WHERE id = 'baf7749c-a6d3-4247-a2a2-e9f4a3fa871e';

-- Update Option A → Growth (pooling, R1500 setup)
UPDATE public.sla_fee_plans
SET plan_code = 'growth',
    plan_label = 'Growth',
    setup_fee_excl_vat = 1500,
    includes_pooling = true,
    membership_admin_fee = 250,
    loans_fee = 50,
    debit_orders_fee = 50,
    accounting_fee = 50,
    updated_at = now()
WHERE id = '9b4bcbd5-a423-4950-b412-cff62f78302f';

-- Update Option B → Enterprise (pooling, R30000 setup)
UPDATE public.sla_fee_plans
SET plan_code = 'enterprise',
    plan_label = 'Enterprise',
    setup_fee_excl_vat = 30000,
    includes_pooling = true,
    membership_admin_fee = 250,
    loans_fee = 50,
    debit_orders_fee = 50,
    accounting_fee = 50,
    updated_at = now()
WHERE id = 'bcb5bed3-8dec-4a44-b8d8-bd13a5c482db';
