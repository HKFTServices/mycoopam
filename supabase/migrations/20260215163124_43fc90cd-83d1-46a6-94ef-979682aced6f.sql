
CREATE TABLE public.daily_stock_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_id uuid REFERENCES public.items(id),
  price_date date NOT NULL,
  cost_excl_vat numeric NOT NULL DEFAULT 0,
  cost_incl_vat numeric NOT NULL DEFAULT 0,
  buy_price_excl_vat numeric NOT NULL DEFAULT 0,
  buy_price_incl_vat numeric NOT NULL DEFAULT 0,
  legacy_id text,
  legacy_stock_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_stock_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all daily_stock_prices"
  ON public.daily_stock_prices FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant admins can manage tenant daily_stock_prices"
  ON public.daily_stock_prices FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id));

CREATE POLICY "Tenant members can view daily_stock_prices"
  ON public.daily_stock_prices FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_daily_stock_prices_updated_at
  BEFORE UPDATE ON public.daily_stock_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
