
-- Create countries reference table
CREATE TABLE public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  iso_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

-- Everyone can read countries
CREATE POLICY "Anyone can view countries"
ON public.countries FOR SELECT
USING (true);

-- Super admins can manage
CREATE POLICY "Super admins can manage countries"
ON public.countries FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_countries_updated_at
BEFORE UPDATE ON public.countries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Seed with common countries
INSERT INTO public.countries (name, iso_code) VALUES
  ('South Africa', 'ZA'),
  ('Botswana', 'BW'),
  ('Namibia', 'NA'),
  ('Zimbabwe', 'ZW'),
  ('Mozambique', 'MZ'),
  ('Eswatini', 'SZ'),
  ('Lesotho', 'LS'),
  ('Zambia', 'ZM'),
  ('Malawi', 'MW'),
  ('Tanzania', 'TZ'),
  ('Kenya', 'KE'),
  ('Uganda', 'UG'),
  ('Nigeria', 'NG'),
  ('Ghana', 'GH'),
  ('Angola', 'AO'),
  ('Democratic Republic of the Congo', 'CD'),
  ('Ethiopia', 'ET'),
  ('Rwanda', 'RW'),
  ('United Kingdom', 'GB'),
  ('United States', 'US'),
  ('Canada', 'CA'),
  ('Australia', 'AU'),
  ('New Zealand', 'NZ'),
  ('Germany', 'DE'),
  ('France', 'FR'),
  ('Netherlands', 'NL'),
  ('Portugal', 'PT'),
  ('India', 'IN'),
  ('China', 'CN'),
  ('Brazil', 'BR'),
  ('United Arab Emirates', 'AE'),
  ('Saudi Arabia', 'SA'),
  ('Japan', 'JP'),
  ('South Korea', 'KR'),
  ('Singapore', 'SG'),
  ('Malaysia', 'MY'),
  ('Thailand', 'TH'),
  ('Egypt', 'EG'),
  ('Morocco', 'MA'),
  ('Ireland', 'IE'),
  ('Italy', 'IT'),
  ('Spain', 'ES'),
  ('Sweden', 'SE'),
  ('Norway', 'NO'),
  ('Denmark', 'DK'),
  ('Switzerland', 'CH'),
  ('Belgium', 'BE'),
  ('Austria', 'AT'),
  ('Poland', 'PL'),
  ('Mexico', 'MX');
