
-- Create member_shares table for legacy ShareTransactions
CREATE TABLE public.member_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  entity_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  transaction_date DATE NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC NOT NULL DEFAULT 0,
  creator_user_id UUID,
  last_modifier_user_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleter_user_id UUID,
  deletion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.member_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all member_shares"
  ON public.member_shares FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can manage tenant member_shares"
  ON public.member_shares FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE POLICY "Tenant members can view member_shares"
  ON public.member_shares FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'));

-- Updated_at trigger
CREATE TRIGGER update_member_shares_updated_at
  BEFORE UPDATE ON public.member_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
