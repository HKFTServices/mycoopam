
-- Debit order mandates table
CREATE TABLE public.debit_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  -- Debit order details
  monthly_amount NUMERIC NOT NULL DEFAULT 0,
  debit_day INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Pool allocations (JSON array: [{pool_id, percentage, amount}])
  pool_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Bank details
  bank_name TEXT,
  branch_code TEXT,
  account_name TEXT,
  account_number TEXT,
  account_type TEXT,
  -- Card details (optional)
  card_number TEXT,
  card_expiry TEXT,
  card_type TEXT,
  -- Signature
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  declined_by UUID,
  declined_at TIMESTAMPTZ,
  declined_reason TEXT,
  notes TEXT,
  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- RLS
ALTER TABLE public.debit_orders ENABLE ROW LEVEL SECURITY;

-- Members can view their own debit orders
CREATE POLICY "Users can view own debit orders" ON public.debit_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_entity_relationships uer
      WHERE uer.entity_id = debit_orders.entity_id
        AND uer.user_id = auth.uid()
        AND uer.is_active = true
    )
  );

-- Members can insert their own debit orders
CREATE POLICY "Users can insert own debit orders" ON public.debit_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_entity_relationships uer
      WHERE uer.entity_id = debit_orders.entity_id
        AND uer.user_id = auth.uid()
        AND uer.is_active = true
    )
  );

-- Tenant admins can manage all debit orders in their tenant
CREATE POLICY "Tenant admins can manage debit orders" ON public.debit_orders
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin'::app_role, debit_orders.tenant_id)
  );

-- Updated_at trigger
CREATE TRIGGER update_debit_orders_updated_at
  BEFORE UPDATE ON public.debit_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
