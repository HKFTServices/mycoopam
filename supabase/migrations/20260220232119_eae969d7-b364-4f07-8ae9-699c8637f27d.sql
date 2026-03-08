
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID,
  application_event TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  message_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all email_logs"
  ON public.email_logs FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can view tenant email_logs"
  ON public.email_logs FOR SELECT
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE INDEX idx_email_logs_tenant_id ON public.email_logs(tenant_id);
CREATE INDEX idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX idx_email_logs_application_event ON public.email_logs(application_event);
