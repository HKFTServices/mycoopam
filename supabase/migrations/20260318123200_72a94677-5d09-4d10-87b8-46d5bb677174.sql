
-- Create api_providers table (global setup, not tenant-specific)
CREATE TABLE public.api_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'query_param',
  auth_param_name TEXT NOT NULL DEFAULT 'access_key',
  secret_name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'ZAR',
  response_path TEXT NOT NULL DEFAULT 'rates',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add updated_at trigger
CREATE TRIGGER update_api_providers_updated_at
  BEFORE UPDATE ON public.api_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.api_providers ENABLE ROW LEVEL SECURITY;

-- Super admins and authenticated users can read
CREATE POLICY "Authenticated users can read api_providers"
  ON public.api_providers FOR SELECT TO authenticated USING (true);

-- Only super_admins can insert/update/delete
CREATE POLICY "Super admins can manage api_providers"
  ON public.api_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Add api_provider_id to items table
ALTER TABLE public.items ADD COLUMN api_provider_id UUID REFERENCES public.api_providers(id);

-- Seed the existing Metals API provider
INSERT INTO public.api_providers (name, base_url, auth_method, auth_param_name, secret_name, base_currency, response_path, notes)
VALUES ('Metals API', 'https://metals-api.com/api', 'query_param', 'access_key', 'METALS_API_KEY', 'ZAR', 'rates', 'Precious metals and currency rates. Supports historical prices via /YYYY-MM-DD endpoint.');
