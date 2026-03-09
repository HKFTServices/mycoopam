
CREATE OR REPLACE FUNCTION public.get_latest_pool_prices(p_tenant_id uuid)
RETURNS TABLE(pool_id uuid, unit_price_buy numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (dpp.pool_id) dpp.pool_id, dpp.unit_price_buy
  FROM public.daily_pool_prices dpp
  WHERE dpp.tenant_id = p_tenant_id
    AND dpp.unit_price_buy > 0
  ORDER BY dpp.pool_id, dpp.totals_date DESC;
$$;
