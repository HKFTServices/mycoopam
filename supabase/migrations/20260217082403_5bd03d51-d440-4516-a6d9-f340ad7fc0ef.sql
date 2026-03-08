
-- Allow any authenticated user to read tenant configuration (for branding during onboarding)
CREATE POLICY "Authenticated users can view tenant configuration"
ON public.tenant_configuration
FOR SELECT
TO authenticated
USING (true);
