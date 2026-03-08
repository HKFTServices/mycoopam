
-- Add vault and document prefix fields to tenant_configuration
ALTER TABLE public.tenant_configuration
  ADD COLUMN IF NOT EXISTS po_prefix text DEFAULT 'PO' NOT NULL,
  ADD COLUMN IF NOT EXISTS quote_prefix text DEFAULT 'QUO' NOT NULL,
  ADD COLUMN IF NOT EXISTS invoice_prefix text DEFAULT 'INV' NOT NULL,
  ADD COLUMN IF NOT EXISTS supplier_invoice_prefix text DEFAULT 'SI' NOT NULL;

-- Create vault_locations table
CREATE TABLE IF NOT EXISTS public.vault_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view vault locations"
  ON public.vault_locations FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage vault locations"
  ON public.vault_locations FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE TRIGGER update_vault_locations_updated_at
  BEFORE UPDATE ON public.vault_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
