
-- Message campaigns table
CREATE TABLE public.message_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL DEFAULT '',
  audience_type TEXT NOT NULL DEFAULT 'all_active_users',
  audience_filter JSONB DEFAULT '{}'::jsonb,
  template_id UUID REFERENCES public.communication_templates(id),
  attachment_type TEXT DEFAULT NULL,
  attachment_config JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  current_batch INTEGER NOT NULL DEFAULT 0,
  next_batch_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all message_campaigns"
  ON public.message_campaigns FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant message_campaigns"
  ON public.message_campaigns FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view message_campaigns"
  ON public.message_campaigns FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Campaign recipients log table
CREATE TABLE public.message_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.message_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID DEFAULT NULL,
  entity_id UUID DEFAULT NULL,
  entity_account_id UUID DEFAULT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  message_id TEXT DEFAULT NULL,
  batch_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.message_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all campaign_recipients"
  ON public.message_campaign_recipients FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant campaign_recipients"
  ON public.message_campaign_recipients FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view campaign_recipients"
  ON public.message_campaign_recipients FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_campaign_recipients_campaign ON public.message_campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON public.message_campaign_recipients(campaign_id, status);
CREATE INDEX idx_message_campaigns_tenant ON public.message_campaigns(tenant_id);

CREATE TRIGGER update_message_campaigns_updated_at
  BEFORE UPDATE ON public.message_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
