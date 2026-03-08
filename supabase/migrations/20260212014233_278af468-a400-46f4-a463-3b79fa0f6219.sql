
-- Control accounts table (created first since pools references it)
CREATE TABLE public.control_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  pool_id UUID, -- set after pool is created
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'vat', 'loan')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pools table matching legacy structure + loan control account
CREATE TABLE public.pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  cash_control_account_id UUID REFERENCES public.control_accounts(id),
  vat_control_account_id UUID REFERENCES public.control_accounts(id),
  loan_control_account_id UUID REFERENCES public.control_accounts(id),
  pool_statement_description TEXT,
  pool_statement_display_type TEXT,
  creator_user_id UUID,
  last_modifier_user_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add pool_id FK now that pools exists
ALTER TABLE public.control_accounts 
  ADD CONSTRAINT control_accounts_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.pools(id);

-- RLS for pools
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all pools" ON public.pools
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant pools" ON public.pools
  FOR ALL USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view pools" ON public.pools
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for control_accounts
ALTER TABLE public.control_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all control accounts" ON public.control_accounts
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant control accounts" ON public.control_accounts
  FOR ALL USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view control accounts" ON public.control_accounts
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger: auto-create 3 control accounts when a pool is inserted
CREATE OR REPLACE FUNCTION public.create_pool_control_accounts()
RETURNS TRIGGER AS $$
DECLARE
  cash_id UUID;
  vat_id UUID;
  loan_id UUID;
BEGIN
  INSERT INTO public.control_accounts (tenant_id, pool_id, name, account_type)
  VALUES (NEW.tenant_id, NEW.id, NEW.name || ' Cash', 'cash')
  RETURNING id INTO cash_id;

  INSERT INTO public.control_accounts (tenant_id, pool_id, name, account_type)
  VALUES (NEW.tenant_id, NEW.id, NEW.name || ' VAT', 'vat')
  RETURNING id INTO vat_id;

  INSERT INTO public.control_accounts (tenant_id, pool_id, name, account_type)
  VALUES (NEW.tenant_id, NEW.id, NEW.name || ' Loans', 'loan')
  RETURNING id INTO loan_id;

  UPDATE public.pools SET
    cash_control_account_id = cash_id,
    vat_control_account_id = vat_id,
    loan_control_account_id = loan_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_create_pool_control_accounts
  AFTER INSERT ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.create_pool_control_accounts();

-- Updated_at triggers
CREATE TRIGGER update_pools_updated_at BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_control_accounts_updated_at BEFORE UPDATE ON public.control_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
