
-- Allow users to SELECT entities they created (needed for .insert().select() during onboarding)
CREATE POLICY "Users can view entities they created"
ON public.entities
FOR SELECT
TO authenticated
USING (creator_user_id = auth.uid());
