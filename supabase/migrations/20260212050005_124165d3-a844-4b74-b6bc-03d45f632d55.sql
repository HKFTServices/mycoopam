
-- Add POP columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN pop_file_path text,
  ADD COLUMN pop_file_name text;

-- Create storage bucket for proof of payment files
INSERT INTO storage.buckets (id, name, public) VALUES ('pop-documents', 'pop-documents', false);

-- RLS: users can upload their own POP
CREATE POLICY "Users can upload own POP"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pop-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: users can view their own POP
CREATE POLICY "Users can view own POP"
ON storage.objects FOR SELECT
USING (bucket_id = 'pop-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: users can update their own POP
CREATE POLICY "Users can update own POP"
ON storage.objects FOR UPDATE
USING (bucket_id = 'pop-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: admins can view all POP
CREATE POLICY "Admins can view all POP"
ON storage.objects FOR SELECT
USING (bucket_id = 'pop-documents' AND has_role(auth.uid(), 'super_admin'::app_role));
