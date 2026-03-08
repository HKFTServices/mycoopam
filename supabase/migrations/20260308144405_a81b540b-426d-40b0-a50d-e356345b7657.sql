CREATE POLICY "Authenticated users can create tenants"
ON public.tenants FOR INSERT
TO authenticated
WITH CHECK (true);