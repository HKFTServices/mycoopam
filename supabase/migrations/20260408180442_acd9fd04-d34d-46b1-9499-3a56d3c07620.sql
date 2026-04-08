-- Fix storage RLS: Allow authenticated users to upload member documents using tenant_id path
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
CREATE POLICY "Users can upload own documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-documents'
  AND auth.role() = 'authenticated'
);

-- Fix storage RLS: Allow authenticated tenant members to view member documents
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
CREATE POLICY "Users can view own documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'member-documents'
  AND auth.role() = 'authenticated'
);

-- Fix entity_bank_details RLS: Allow any authenticated tenant member OR the creator to insert
-- The existing policy requires is_tenant_member which fails during membership application
DROP POLICY IF EXISTS "Users can insert own entity_bank_details" ON public.entity_bank_details;
CREATE POLICY "Users can insert own entity_bank_details" ON public.entity_bank_details
FOR INSERT TO authenticated
WITH CHECK (
  creator_user_id = auth.uid()
);