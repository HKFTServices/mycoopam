-- Allow any authenticated user to view terms & conditions (needed during onboarding before tenant membership)
CREATE POLICY "Authenticated users can view terms"
ON public.terms_conditions FOR SELECT
TO authenticated
USING (true);
