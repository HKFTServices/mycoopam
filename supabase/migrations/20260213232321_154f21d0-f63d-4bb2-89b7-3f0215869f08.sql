
-- Create operating_journals table for transaction-by-transaction journal/bank postings
CREATE TABLE public.operating_journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  transaction_type TEXT NOT NULL DEFAULT 'journal' CHECK (transaction_type IN ('journal', 'bank')),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gl_account_id UUID NOT NULL REFERENCES public.gl_accounts(id),
  control_account_id UUID NOT NULL REFERENCES public.control_accounts(id),
  entry_type TEXT NOT NULL DEFAULT 'debit' CHECK (entry_type IN ('debit', 'credit')),
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  notes TEXT,
  posted_by UUID REFERENCES auth.users(id),
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversed_by UUID REFERENCES auth.users(id),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operating_journals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage all operating_journals"
  ON public.operating_journals FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant operating_journals"
  ON public.operating_journals FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view operating_journals"
  ON public.operating_journals FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_operating_journals_updated_at
  BEFORE UPDATE ON public.operating_journals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index for common queries
CREATE INDEX idx_operating_journals_tenant_date ON public.operating_journals(tenant_id, transaction_date DESC);
CREATE INDEX idx_operating_journals_gl_account ON public.operating_journals(gl_account_id);
