
-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  pool_id UUID NOT NULL REFERENCES public.pools(id),
  transaction_type_id UUID NOT NULL REFERENCES public.transaction_types(id),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  units NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'eft',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  declined_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all transactions"
  ON public.transactions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant transactions"
  ON public.transactions FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Member pool holdings table
CREATE TABLE public.member_pool_holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  pool_id UUID NOT NULL REFERENCES public.pools(id),
  user_id UUID NOT NULL,
  units NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_account_id, pool_id)
);

ALTER TABLE public.member_pool_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all holdings"
  ON public.member_pool_holdings FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant holdings"
  ON public.member_pool_holdings FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can view own holdings"
  ON public.member_pool_holdings FOR SELECT
  USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_member_pool_holdings_updated_at
  BEFORE UPDATE ON public.member_pool_holdings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
