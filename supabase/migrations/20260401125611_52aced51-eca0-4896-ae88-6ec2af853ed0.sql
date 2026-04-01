
-- Allow users to update entities they are linked to (not just ones they created)
DROP POLICY IF EXISTS "Users can update entities they created" ON public.entities;
CREATE POLICY "Users can update their linked entities"
  ON public.entities FOR UPDATE TO authenticated
  USING (
    creator_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_entity_relationships ue
      WHERE ue.entity_id = entities.id AND ue.user_id = auth.uid()
    )
  );
