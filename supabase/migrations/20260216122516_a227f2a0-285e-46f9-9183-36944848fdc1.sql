
-- Add Legal Entity (6) and Administrator (7) account types
INSERT INTO public.entity_account_types (name, prefix, account_type, allow_public_registration, is_active, number_count, membership_fee)
VALUES 
  ('Legal Entity', 'ALE', 6, false, true, 5, 0),
  ('Administrator', 'AAD', 7, false, true, 5, 0);

-- Add legal_entity_id and administrator_entity_id columns to tenant_configuration
ALTER TABLE public.tenant_configuration 
  ADD COLUMN legal_entity_id uuid REFERENCES public.entities(id),
  ADD COLUMN administrator_entity_id uuid REFERENCES public.entities(id);
