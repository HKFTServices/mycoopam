
-- Allow authenticated users to insert their own bank details during profile editing
CREATE POLICY "Users can insert own entity_bank_details"
ON public.entity_bank_details
FOR INSERT
TO authenticated
WITH CHECK (
  creator_user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
);

-- Allow users to update bank details they created
CREATE POLICY "Users can update own entity_bank_details"
ON public.entity_bank_details
FOR UPDATE
TO authenticated
USING (
  creator_user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
)
WITH CHECK (
  creator_user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
);
