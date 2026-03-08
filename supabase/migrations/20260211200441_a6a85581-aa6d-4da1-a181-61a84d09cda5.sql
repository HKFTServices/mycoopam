
CREATE TABLE public.bank_account_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_account_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage bank account types"
  ON public.bank_account_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant members can view bank account types"
  ON public.bank_account_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_bank_account_types_updated_at
  BEFORE UPDATE ON public.bank_account_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
