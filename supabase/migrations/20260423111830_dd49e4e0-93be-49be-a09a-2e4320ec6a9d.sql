-- Add attachment URL to tickets and messages
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- Create public storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated users to upload, public can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Support attachments are publicly readable'
  ) THEN
    CREATE POLICY "Support attachments are publicly readable"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'support-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Authenticated users can upload support attachments'
  ) THEN
    CREATE POLICY "Authenticated users can upload support attachments"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'support-attachments');
  END IF;
END $$;