-- Create admin stock purchase/sale/adjustment transactions table
CREATE TABLE public.admin_stock_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  transaction_type_code text NOT NULL CHECK (transaction_type_code IN ('STOCK_PURCHASES', 'STOCK_SALES', 'STOCK_ADJUSTMENTS')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'vault_confirmed', 'approved', 'declined', 'rolled_back')),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  reference text,
  -- Totals (denormalized for quick display)
  total_invoice_amount numeric NOT NULL DEFAULT 0,
  total_excl_vat numeric NOT NULL DEFAULT 0,
  total_vat numeric NOT NULL DEFAULT 0,
  -- Vault confirmation fields
  vault_confirmed_at timestamp with time zone,
  vault_confirmed_by uuid,
  vault_reference text,
  vault_notes text,
  -- Approval fields
  approved_at timestamp with time zone,
  approved_by uuid,
  declined_at timestamp with time zone,
  declined_by uuid,
  declined_reason text,
  -- Rollback
  rolled_back_at timestamp with time zone,
  rolled_back_by uuid,
  -- Audit
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Line items for admin stock transactions
CREATE TABLE public.admin_stock_transaction_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_stock_transaction_id uuid NOT NULL REFERENCES public.admin_stock_transactions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_id uuid NOT NULL REFERENCES public.items(id),
  pool_id uuid NOT NULL REFERENCES public.pools(id),
  quantity numeric NOT NULL DEFAULT 0,
  unit_price_excl_vat numeric NOT NULL DEFAULT 0,
  unit_price_incl_vat numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,
  line_total_excl_vat numeric NOT NULL DEFAULT 0,
  line_total_incl_vat numeric NOT NULL DEFAULT 0,
  line_vat numeric NOT NULL DEFAULT 0,
  -- For adjustments: positive = write-on, negative = write-off
  adjustment_type text, -- 'write_on' | 'write_off'
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_stock_transaction_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_stock_transactions
CREATE POLICY "Super admins can manage admin stock transactions"
  ON public.admin_stock_transactions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant admin stock transactions"
  ON public.admin_stock_transactions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view admin stock transactions"
  ON public.admin_stock_transactions FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS policies for admin_stock_transaction_lines
CREATE POLICY "Super admins can manage admin stock transaction lines"
  ON public.admin_stock_transaction_lines FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant admin stock transaction lines"
  ON public.admin_stock_transaction_lines FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view admin stock transaction lines"
  ON public.admin_stock_transaction_lines FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_admin_stock_transactions_updated_at
  BEFORE UPDATE ON public.admin_stock_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();