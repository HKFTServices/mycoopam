
-- Add gender enum
CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other');

-- Add registration_status enum
CREATE TYPE public.registration_status AS ENUM ('incomplete', 'pending_verification', 'registered');

-- Extend profiles table
ALTER TABLE public.profiles
  ADD COLUMN title_id uuid REFERENCES public.titles(id),
  ADD COLUMN initials text,
  ADD COLUMN known_as text,
  ADD COLUMN gender gender_type,
  ADD COLUMN date_of_birth date,
  ADD COLUMN alt_phone text,
  ADD COLUMN cc_email text,
  ADD COLUMN registration_status registration_status NOT NULL DEFAULT 'incomplete';

-- Create addresses table
CREATE TABLE public.addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  address_type text NOT NULL DEFAULT 'residential',
  street_address text NOT NULL,
  suburb text,
  city text NOT NULL,
  province text,
  postal_code text,
  country text NOT NULL DEFAULT 'South Africa',
  latitude double precision,
  longitude double precision,
  place_id text,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own addresses"
ON public.addresses FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_addresses_updated_at
BEFORE UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create member_documents table
CREATE TABLE public.member_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own documents"
ON public.member_documents FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all documents"
ON public.member_documents FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_member_documents_updated_at
BEFORE UPDATE ON public.member_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create tc_acceptances table
CREATE TABLE public.tc_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  terms_condition_id uuid NOT NULL REFERENCES public.terms_conditions(id),
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address text
);

ALTER TABLE public.tc_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own acceptances"
ON public.tc_acceptances FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all acceptances"
ON public.tc_acceptances FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create storage bucket for member documents
INSERT INTO storage.buckets (id, name, public) VALUES ('member-documents', 'member-documents', false);

CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'member-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'member-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Super admins can view all member documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-documents' AND has_role(auth.uid(), 'super_admin'::app_role));
