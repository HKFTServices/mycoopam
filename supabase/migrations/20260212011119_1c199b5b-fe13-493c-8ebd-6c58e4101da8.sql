
-- Create referrers table to track referrer registrations under referral houses
CREATE TABLE public.referrers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  referral_house_entity_id UUID NOT NULL REFERENCES public.entities(id),
  referral_house_account_id UUID NOT NULL REFERENCES public.entity_accounts(id),
  referrer_number TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, referral_house_account_id)
);

-- Enable RLS
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Super admins can manage all referrers"
ON public.referrers FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant referrers"
ON public.referrers FOR ALL
USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Users can view own referrer records"
ON public.referrers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own referrer records"
ON public.referrers FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_referrers_updated_at
BEFORE UPDATE ON public.referrers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();
