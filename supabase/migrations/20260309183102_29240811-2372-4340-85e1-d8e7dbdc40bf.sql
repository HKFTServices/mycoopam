ALTER TABLE public.document_types 
ADD COLUMN IF NOT EXISTS template_file_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS template_key text DEFAULT NULL;