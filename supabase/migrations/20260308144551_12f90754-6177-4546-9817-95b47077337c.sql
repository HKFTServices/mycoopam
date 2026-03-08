-- Drop the old policy and create one that allows both anon and authenticated
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;

CREATE POLICY "Anyone can register a tenant"
ON public.tenants FOR INSERT
TO anon, authenticated
WITH CHECK (true);