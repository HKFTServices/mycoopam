
-- Create unit_transactions table
CREATE TABLE public.unit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  pool_id UUID NOT NULL REFERENCES public.pools(id),
  entity_account_id UUID REFERENCES public.entity_accounts(id),
  user_id UUID,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'unit',
  legacy_id TEXT,
  legacy_transaction_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  pending BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.unit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all unit_transactions"
  ON public.unit_transactions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant unit_transactions"
  ON public.unit_transactions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view unit_transactions"
  ON public.unit_transactions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_unit_transactions_tenant ON public.unit_transactions(tenant_id);
CREATE INDEX idx_unit_transactions_pool ON public.unit_transactions(pool_id);
CREATE INDEX idx_unit_transactions_entity_account ON public.unit_transactions(entity_account_id);
CREATE INDEX idx_unit_transactions_date ON public.unit_transactions(transaction_date);
CREATE INDEX idx_unit_transactions_legacy ON public.unit_transactions(tenant_id, legacy_id);

-- Updated_at trigger
CREATE TRIGGER update_unit_transactions_updated_at
  BEFORE UPDATE ON public.unit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
