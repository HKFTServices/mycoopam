
-- Create share_classes table for dynamic share class configuration
CREATE TABLE public.share_classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  price_per_share NUMERIC NOT NULL DEFAULT 0,
  max_per_member INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint on name per tenant
ALTER TABLE public.share_classes ADD CONSTRAINT share_classes_tenant_name_unique UNIQUE (tenant_id, name);

-- Enable RLS
ALTER TABLE public.share_classes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Super admins can manage all share_classes"
  ON public.share_classes FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant share_classes"
  ON public.share_classes FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view share_classes"
  ON public.share_classes FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_share_classes_updated_at
  BEFORE UPDATE ON public.share_classes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
