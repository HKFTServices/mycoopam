
-- Allow authenticated users to insert their own tenant membership during onboarding
CREATE POLICY "Users can insert own tenant membership"
ON public.tenant_memberships
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
