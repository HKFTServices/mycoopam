
-- Referral Plans table for tenant-configurable referral/commission programs
CREATE TABLE public.referral_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  commission_percentage NUMERIC NOT NULL DEFAULT 0,
  commission_basis TEXT NOT NULL DEFAULT 'gross' CHECK (commission_basis IN ('gross', 'net')),
  commission_duration TEXT NOT NULL DEFAULT 'all_deposits' CHECK (commission_duration IN ('first_deposit', 'all_deposits', 'months_limited')),
  duration_months INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.referral_plans ENABLE ROW LEVEL SECURITY;

-- Tenant members can view referral plans
CREATE POLICY "Tenant members can view referral plans"
  ON public.referral_plans FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Tenant admins can manage referral plans  
CREATE POLICY "Tenant admins can manage referral plans"
  ON public.referral_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tenant_admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tenant_admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Add referral_plan_id to referrers table to link referrer to a plan
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS referral_plan_id UUID REFERENCES public.referral_plans(id);

-- Add referral_code column to referrers for shareable links
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- Create unique index on referral_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_referral_code ON public.referrers(referral_code) WHERE referral_code IS NOT NULL;

-- Add updated_at trigger
CREATE TRIGGER update_referral_plans_updated_at
  BEFORE UPDATE ON public.referral_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
