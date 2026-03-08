-- Allow public (unauthenticated) access to basic tenant info for landing pages
CREATE POLICY "Public can view active tenant by slug"
  ON public.tenants
  FOR SELECT
  USING (is_active = true AND slug IS NOT NULL);