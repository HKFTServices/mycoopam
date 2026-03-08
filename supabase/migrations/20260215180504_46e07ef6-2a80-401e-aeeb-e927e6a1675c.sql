
-- Create daily_pool_prices table for unit price totals per pool per day
CREATE TABLE public.daily_pool_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pool_id uuid REFERENCES public.pools(id),
  totals_date date NOT NULL,
  total_stock numeric NOT NULL DEFAULT 0,
  total_units numeric NOT NULL DEFAULT 0,
  cash_control numeric NOT NULL DEFAULT 0,
  vat_control numeric NOT NULL DEFAULT 0,
  loan_control numeric NOT NULL DEFAULT 0,
  member_interest_buy numeric NOT NULL DEFAULT 0,
  member_interest_sell numeric NOT NULL DEFAULT 0,
  unit_price_buy numeric NOT NULL DEFAULT 0,
  unit_price_sell numeric NOT NULL DEFAULT 0,
  legacy_id text,
  legacy_pool_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_pool_prices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all daily_pool_prices"
  ON public.daily_pool_prices FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant daily_pool_prices"
  ON public.daily_pool_prices FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view daily_pool_prices"
  ON public.daily_pool_prices FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_daily_pool_prices_updated_at
  BEFORE UPDATE ON public.daily_pool_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
