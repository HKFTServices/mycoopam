
-- Create entity_account_types table
CREATE TABLE public.entity_account_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  prefix text NOT NULL,
  allow_public_registration boolean NOT NULL DEFAULT false,
  account_type integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  number_count integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.entity_account_types ENABLE ROW LEVEL SECURITY;

-- Super admins can manage
CREATE POLICY "Super admins can manage entity account types"
ON public.entity_account_types
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Tenant members can view
CREATE POLICY "Tenant members can view entity account types"
ON public.entity_account_types
FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_entity_account_types_updated_at
BEFORE UPDATE ON public.entity_account_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
