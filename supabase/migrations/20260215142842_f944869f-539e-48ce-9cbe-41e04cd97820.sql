
-- Make transaction_types global by making tenant_id nullable
ALTER TABLE public.transaction_types ALTER COLUMN tenant_id DROP NOT NULL;

-- Update RLS policies
DROP POLICY IF EXISTS "Tenant admins can manage transaction_types" ON public.transaction_types;
DROP POLICY IF EXISTS "Tenant members can view transaction_types" ON public.transaction_types;
DROP POLICY IF EXISTS "Super admins can manage all transaction_types" ON public.transaction_types;
DROP POLICY IF EXISTS "Anyone can view transaction_types" ON public.transaction_types;

CREATE POLICY "Anyone can view transaction types"
  ON public.transaction_types FOR SELECT
  USING (true);

CREATE POLICY "Super admins can manage transaction types"
  ON public.transaction_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
