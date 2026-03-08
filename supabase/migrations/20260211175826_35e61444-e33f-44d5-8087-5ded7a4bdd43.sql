
-- System-wide settings table (not tenant-specific, super_admin only)
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  is_secret boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage system settings"
ON public.system_settings FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed the two API key entries
INSERT INTO public.system_settings (key, value, description, is_secret) VALUES
  ('GOOGLE_MAPS_API_KEY', NULL, 'Google Maps API Key for address autocomplete', true),
  ('SMS_API_KEY', NULL, 'SMS provider API Key for notifications', true);
