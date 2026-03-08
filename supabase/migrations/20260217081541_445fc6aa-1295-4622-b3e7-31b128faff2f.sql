
-- Drop the restrictive INSERT policy and recreate as permissive
DROP POLICY IF EXISTS "Users can insert own entities" ON public.entities;

CREATE POLICY "Users can insert own entities"
ON public.entities
FOR INSERT
TO authenticated
WITH CHECK (creator_user_id = auth.uid());
