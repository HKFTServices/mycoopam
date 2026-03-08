
-- Create a public bucket for tenant logos
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-logos', 'tenant-logos', true);

-- Allow authenticated users to upload tenant logos
CREATE POLICY "Authenticated users can upload tenant logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tenant-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update tenant logos
CREATE POLICY "Authenticated users can update tenant logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tenant-logos' AND auth.role() = 'authenticated');

-- Allow public read access to tenant logos
CREATE POLICY "Public read access for tenant logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-logos');
