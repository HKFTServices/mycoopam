-- Allow users to insert addresses for entities they own
CREATE POLICY "Users can insert entity addresses"
ON public.addresses FOR INSERT
TO authenticated
WITH CHECK (
  entity_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.user_entity_relationships ue
    WHERE ue.entity_id = addresses.entity_id AND ue.user_id = auth.uid()
  )
);

-- Allow users to view addresses for entities they own
CREATE POLICY "Users can view entity addresses"
ON public.addresses FOR SELECT
TO authenticated
USING (
  entity_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.user_entity_relationships ue
    WHERE ue.entity_id = addresses.entity_id AND ue.user_id = auth.uid()
  )
);

-- Allow users to update addresses for entities they own
CREATE POLICY "Users can update entity addresses"
ON public.addresses FOR UPDATE
TO authenticated
USING (
  entity_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.user_entity_relationships ue
    WHERE ue.entity_id = addresses.entity_id AND ue.user_id = auth.uid()
  )
);

-- Allow users to insert documents for entities they created
CREATE POLICY "Users can insert own entity documents"
ON public.entity_documents FOR INSERT
TO authenticated
WITH CHECK (
  creator_user_id = auth.uid()
);

-- Allow users to view documents for entities they are linked to
CREATE POLICY "Users can view own entity documents"
ON public.entity_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_entity_relationships ue
    WHERE ue.entity_id = entity_documents.entity_id AND ue.user_id = auth.uid()
  )
);
