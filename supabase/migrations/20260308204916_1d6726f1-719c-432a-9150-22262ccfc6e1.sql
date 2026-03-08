
-- 1. Loan Settings (one row per tenant)
CREATE TABLE public.loan_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_term_months INTEGER NOT NULL DEFAULT 12,
  pool_value_multiple NUMERIC NOT NULL DEFAULT 1.0,
  interest_type TEXT NOT NULL DEFAULT 'simple' CHECK (interest_type IN ('simple', 'compound')),
  interest_rate_low NUMERIC NOT NULL DEFAULT 5.0,
  interest_rate_medium NUMERIC NOT NULL DEFAULT 8.0,
  interest_rate_high NUMERIC NOT NULL DEFAULT 12.0,
  loan_fee_low NUMERIC NOT NULL DEFAULT 150.00,
  loan_fee_medium NUMERIC NOT NULL DEFAULT 200.00,
  loan_fee_high NUMERIC NOT NULL DEFAULT 300.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.loan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view loan settings"
  ON public.loan_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage loan settings"
  ON public.loan_settings FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

-- 2. Budget Categories (tenant-configurable)
CREATE TABLE public.budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('income', 'expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view budget categories"
  ON public.budget_categories FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage budget categories"
  ON public.budget_categories FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

-- 3. Loan Budget Entries (member's budget snapshot)
CREATE TABLE public.loan_budget_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id) ON DELETE CASCADE,
  budget_category_id UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view own budget entries"
  ON public.loan_budget_entries FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can manage own budget entries"
  ON public.loan_budget_entries FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 4. Loan Applications
CREATE TABLE public.loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  applicant_user_id UUID NOT NULL,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  loan_date DATE NOT NULL,
  amount_requested NUMERIC NOT NULL,
  amount_approved NUMERIC,
  term_months_requested INTEGER NOT NULL,
  term_months_approved INTEGER,
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  interest_rate NUMERIC,
  loan_fee NUMERIC,
  total_loan NUMERIC,
  monthly_instalment NUMERIC,
  monthly_available_repayment NUMERIC NOT NULL,
  existing_outstanding NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  security_assets TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'declined', 'accepted', 'signed', 'disbursed', 'cancelled')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  member_accepted_at TIMESTAMPTZ,
  member_signature_path TEXT,
  admin_signed_at TIMESTAMPTZ,
  admin_signature_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view loan applications"
  ON public.loan_applications FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert own loan applications"
  ON public.loan_applications FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND applicant_user_id = auth.uid());

CREATE POLICY "Tenant members can update own pending applications"
  ON public.loan_applications FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- Triggers for updated_at
CREATE TRIGGER update_loan_settings_updated_at BEFORE UPDATE ON public.loan_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_budget_categories_updated_at BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_loan_budget_entries_updated_at BEFORE UPDATE ON public.loan_budget_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_loan_applications_updated_at BEFORE UPDATE ON public.loan_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
