
-- Create entity_bank_details table for bank details linked to entities
CREATE TABLE public.entity_bank_details (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_id uuid NOT NULL REFERENCES public.entities(id),
  bank_id uuid NOT NULL REFERENCES public.banks(id),
  bank_account_type_id uuid NOT NULL REFERENCES public.bank_account_types(id),
  account_holder text NOT NULL,
  account_number text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  deleter_user_id uuid,
  deletion_time timestamptz,
  creator_user_id uuid,
  last_modifier_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.entity_bank_details ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all entity_bank_details"
ON public.entity_bank_details FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant entity_bank_details"
ON public.entity_bank_details FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view entity_bank_details"
ON public.entity_bank_details FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_entity_bank_details_updated_at
BEFORE UPDATE ON public.entity_bank_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
