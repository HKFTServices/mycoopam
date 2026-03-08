
-- Create enum for application events
CREATE TYPE public.application_event AS ENUM (
  'none',
  'user_registration_completed',
  'account_creation_successful'
);

-- Create communication_templates table
CREATE TABLE public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  is_system_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  application_event application_event NOT NULL DEFAULT 'none',
  is_email_active boolean NOT NULL DEFAULT true,
  is_sms_active boolean NOT NULL DEFAULT false,
  is_push_notification_active boolean NOT NULL DEFAULT false,
  is_web_app_active boolean NOT NULL DEFAULT false,
  subject text,
  body_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage communication templates"
  ON public.communication_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own tenant templates"
  ON public.communication_templates FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view templates"
  ON public.communication_templates FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_communication_templates_updated_at
  BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create communication_template_parameters table
CREATE TABLE public.communication_template_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.communication_templates(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  notes text,
  example_text text,
  is_system_default boolean NOT NULL DEFAULT false,
  data_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_template_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage template parameters"
  ON public.communication_template_parameters FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage own tenant parameters"
  ON public.communication_template_parameters FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view parameters"
  ON public.communication_template_parameters FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_communication_template_parameters_updated_at
  BEFORE UPDATE ON public.communication_template_parameters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
