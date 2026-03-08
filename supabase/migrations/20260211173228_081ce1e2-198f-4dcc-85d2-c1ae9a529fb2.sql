
-- Create titles table
CREATE TABLE public.titles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage titles"
ON public.titles FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant members can view titles"
ON public.titles FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_titles_updated_at
BEFORE UPDATE ON public.titles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create terms_condition_type enum
CREATE TYPE public.terms_condition_type AS ENUM ('registration', 'membership', 'pool', 'tax');

-- Create terms_conditions table
CREATE TABLE public.terms_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  content text NOT NULL,
  condition_type terms_condition_type NOT NULL DEFAULT 'registration',
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  language_code text NOT NULL DEFAULT 'en',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.terms_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage terms"
ON public.terms_conditions FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant members can view terms"
ON public.terms_conditions FOR SELECT
USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_terms_conditions_updated_at
BEFORE UPDATE ON public.terms_conditions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
