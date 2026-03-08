
-- Create income_expense_items table for accounting rules (cash movements between pools)
CREATE TABLE public.income_expense_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  item_code TEXT NOT NULL,
  description TEXT NOT NULL,
  pool_id UUID NOT NULL REFERENCES public.pools(id),
  recurrence_type TEXT NOT NULL DEFAULT 'ad_hoc',
  debit_control_account_id UUID REFERENCES public.control_accounts(id),
  credit_control_account_id UUID REFERENCES public.control_accounts(id),
  amount NUMERIC DEFAULT 0,
  percentage NUMERIC DEFAULT 0,
  tax_type_id UUID REFERENCES public.tax_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  creator_user_id UUID,
  last_modifier_user_id UUID,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, item_code)
);

-- Enable RLS
ALTER TABLE public.income_expense_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage all income_expense_items"
ON public.income_expense_items FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant income_expense_items"
ON public.income_expense_items FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view income_expense_items"
ON public.income_expense_items FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_income_expense_items_updated_at
BEFORE UPDATE ON public.income_expense_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index for tenant queries
CREATE INDEX idx_income_expense_items_tenant ON public.income_expense_items(tenant_id);
