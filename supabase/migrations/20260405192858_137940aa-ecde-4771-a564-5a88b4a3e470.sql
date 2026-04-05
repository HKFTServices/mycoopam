
CREATE TABLE public.tenant_crypto_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  crypto_name TEXT NOT NULL,
  crypto_symbol TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  destination_tag TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_crypto_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view crypto addresses"
ON public.tenant_crypto_addresses FOR SELECT
TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage crypto addresses"
ON public.tenant_crypto_addresses FOR INSERT
TO authenticated
WITH CHECK (
  public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  OR public.has_tenant_role(auth.uid(), 'manager', tenant_id)
);

CREATE POLICY "Tenant admins can update crypto addresses"
ON public.tenant_crypto_addresses FOR UPDATE
TO authenticated
USING (
  public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  OR public.has_tenant_role(auth.uid(), 'manager', tenant_id)
);

CREATE POLICY "Tenant admins can delete crypto addresses"
ON public.tenant_crypto_addresses FOR DELETE
TO authenticated
USING (
  public.has_tenant_role(auth.uid(), 'tenant_admin', tenant_id)
  OR public.has_tenant_role(auth.uid(), 'manager', tenant_id)
);

CREATE TRIGGER update_tenant_crypto_addresses_updated_at
BEFORE UPDATE ON public.tenant_crypto_addresses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
