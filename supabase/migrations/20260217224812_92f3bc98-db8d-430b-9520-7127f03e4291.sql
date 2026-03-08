
-- Create cashflow_transactions table (CFT)
CREATE TABLE public.cashflow_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  transaction_id UUID REFERENCES public.transactions(id),
  parent_id UUID REFERENCES public.cashflow_transactions(id),
  entity_account_id UUID REFERENCES public.entity_accounts(id),
  control_account_id UUID REFERENCES public.control_accounts(id),
  pool_id UUID REFERENCES public.pools(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  entry_type TEXT NOT NULL DEFAULT 'allocation',
  is_bank BOOLEAN NOT NULL DEFAULT false,
  reference TEXT,
  notes TEXT,
  legacy_transaction_id TEXT,
  posted_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cft_tenant_id ON public.cashflow_transactions(tenant_id);
CREATE INDEX idx_cft_transaction_id ON public.cashflow_transactions(transaction_id);
CREATE INDEX idx_cft_parent_id ON public.cashflow_transactions(parent_id);
CREATE INDEX idx_cft_entity_account_id ON public.cashflow_transactions(entity_account_id);
CREATE INDEX idx_cft_control_account_id ON public.cashflow_transactions(control_account_id);
CREATE INDEX idx_cft_transaction_date ON public.cashflow_transactions(transaction_date);

-- Updated_at trigger
CREATE TRIGGER update_cashflow_transactions_updated_at
  BEFORE UPDATE ON public.cashflow_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.cashflow_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all cashflow_transactions"
  ON public.cashflow_transactions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant cashflow_transactions"
  ON public.cashflow_transactions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view cashflow_transactions"
  ON public.cashflow_transactions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));
