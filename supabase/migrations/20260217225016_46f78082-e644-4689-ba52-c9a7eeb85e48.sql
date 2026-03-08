
-- Create commissions table to track commission entries pending payment to referral houses
CREATE TABLE public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  transaction_id UUID REFERENCES public.transactions(id),
  cashflow_transaction_id UUID REFERENCES public.cashflow_transactions(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  referrer_entity_id UUID REFERENCES public.entities(id),
  referral_house_entity_id UUID REFERENCES public.entities(id),
  referral_house_account_id UUID REFERENCES public.entity_accounts(id),
  commission_percentage NUMERIC NOT NULL DEFAULT 0,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_date DATE,
  payment_reference TEXT,
  paid_by UUID,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_commissions_tenant_id ON public.commissions(tenant_id);
CREATE INDEX idx_commissions_status ON public.commissions(status);
CREATE INDEX idx_commissions_referral_house ON public.commissions(referral_house_account_id);
CREATE INDEX idx_commissions_transaction_id ON public.commissions(transaction_id);
CREATE INDEX idx_commissions_transaction_date ON public.commissions(transaction_date);

-- Updated_at trigger
CREATE TRIGGER update_commissions_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all commissions"
  ON public.commissions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant commissions"
  ON public.commissions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view commissions"
  ON public.commissions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));
