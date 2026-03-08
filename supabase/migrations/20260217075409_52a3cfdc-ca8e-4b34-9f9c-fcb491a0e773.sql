-- Allow any authenticated user to view document requirements (needed during onboarding before tenant membership)
CREATE POLICY "Authenticated users can view document requirements"
ON public.document_entity_requirements FOR SELECT
TO authenticated
USING (true);

-- Allow any authenticated user to view document types (needed during onboarding)
CREATE POLICY "Authenticated users can view document types"
ON public.document_types FOR SELECT
TO authenticated
USING (true);
