
-- Allow authenticated users to update sla_fee_plans
CREATE POLICY "Authenticated users can update fee plans"
ON public.sla_fee_plans
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
