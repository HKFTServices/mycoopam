
-- Stock item transactions from legacy system
CREATE TABLE public.stock_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_id UUID REFERENCES public.entities(id),
  item_id UUID REFERENCES public.items(id),
  transaction_date DATE NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  pending BOOLEAN NOT NULL DEFAULT false,
  stock_transaction_type TEXT,
  transaction_type TEXT,
  user_id UUID,
  legacy_transaction_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all stock_transactions"
  ON public.stock_transactions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant stock_transactions"
  ON public.stock_transactions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view stock_transactions"
  ON public.stock_transactions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_stock_transactions_tenant ON public.stock_transactions(tenant_id);
CREATE INDEX idx_stock_transactions_entity ON public.stock_transactions(entity_id);
CREATE INDEX idx_stock_transactions_item ON public.stock_transactions(item_id);
CREATE INDEX idx_stock_transactions_legacy_txn ON public.stock_transactions(legacy_transaction_id);

-- Updated_at trigger
CREATE TRIGGER update_stock_transactions_updated_at
  BEFORE UPDATE ON public.stock_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
