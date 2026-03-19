
-- Head Office settings (super admin company details for invoices)
CREATE TABLE public.head_office_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  registration_number TEXT,
  vat_number TEXT,
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  street_address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'South Africa',
  bank_name TEXT,
  bank_branch_code TEXT,
  bank_account_number TEXT,
  bank_account_holder TEXT,
  bank_account_type TEXT,
  invoice_prefix TEXT DEFAULT 'HKFT',
  invoice_next_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.head_office_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage head office settings"
  ON public.head_office_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Tenant fee configuration
CREATE TABLE public.tenant_fee_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  monthly_admin_fee NUMERIC NOT NULL DEFAULT 0,
  per_member_fee NUMERIC NOT NULL DEFAULT 0,
  transaction_fee_percentage NUMERIC NOT NULL DEFAULT 0,
  vault_fee NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_fee_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant fee config"
  ON public.tenant_fee_config
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Tenant invoices
CREATE TABLE public.tenant_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  monthly_admin_fee NUMERIC NOT NULL DEFAULT 0,
  per_member_fee NUMERIC NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  member_fee_total NUMERIC NOT NULL DEFAULT 0,
  transaction_fee_total NUMERIC NOT NULL DEFAULT 0,
  vault_fee NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 15,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant invoices"
  ON public.tenant_invoices
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Triggers for updated_at
CREATE TRIGGER set_head_office_settings_updated_at
  BEFORE UPDATE ON public.head_office_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_tenant_fee_config_updated_at
  BEFORE UPDATE ON public.tenant_fee_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_tenant_invoices_updated_at
  BEFORE UPDATE ON public.tenant_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed one default head office row
INSERT INTO public.head_office_settings (company_name) VALUES ('HKFT Services');
