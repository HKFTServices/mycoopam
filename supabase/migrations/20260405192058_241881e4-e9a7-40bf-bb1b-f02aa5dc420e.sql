-- Create debit order batches table
CREATE TABLE public.debit_order_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  processing_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  declined_by UUID,
  declined_at TIMESTAMPTZ,
  declined_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debit_order_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view debit order batches"
  ON public.debit_order_batches FOR SELECT TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'clerk', tenant_id)
  );

CREATE POLICY "Admins and managers can create debit order batches"
  ON public.debit_order_batches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'clerk', tenant_id)
  );

CREATE POLICY "Admins and managers can update debit order batches"
  ON public.debit_order_batches FOR UPDATE TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id)
  );

-- Create debit order batch items table
CREATE TABLE public.debit_order_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.debit_order_batches(id) ON DELETE CASCADE,
  debit_order_id UUID NOT NULL REFERENCES public.debit_orders(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  monthly_amount NUMERIC NOT NULL DEFAULT 0,
  pool_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  fee_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debit_order_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view batch items"
  ON public.debit_order_batch_items FOR SELECT TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'clerk', tenant_id)
  );

CREATE POLICY "Admins and managers can create batch items"
  ON public.debit_order_batch_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'clerk', tenant_id)
  );

CREATE POLICY "Admins and managers can update batch items"
  ON public.debit_order_batch_items FOR UPDATE TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'super_admin', tenant_id) OR
    public.has_tenant_role(auth.uid(), 'manager', tenant_id)
  );

-- Triggers for updated_at
CREATE TRIGGER update_debit_order_batches_updated_at
  BEFORE UPDATE ON public.debit_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_debit_order_batch_items_updated_at
  BEFORE UPDATE ON public.debit_order_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();