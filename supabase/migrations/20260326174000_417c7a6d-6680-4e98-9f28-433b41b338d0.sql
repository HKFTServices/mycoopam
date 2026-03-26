-- Pool investor stats: per-pool distinct investors + tenant total investors
CREATE OR REPLACE FUNCTION public.get_pool_investor_stats(p_tenant_id uuid)
RETURNS TABLE(pool_id uuid, investor_count bigint, total_investors bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH holdings AS (
    SELECT mph.pool_id, mph.user_id
    FROM public.member_pool_holdings mph
    WHERE mph.tenant_id = p_tenant_id
      AND mph.units > 0
    GROUP BY mph.pool_id, mph.user_id
  ),
  total AS (
    SELECT COUNT(DISTINCT user_id) AS total_investors
    FROM holdings
  ),
  per_pool AS (
    SELECT pool_id, COUNT(DISTINCT user_id) AS investor_count
    FROM holdings
    GROUP BY pool_id
  )
  SELECT p.pool_id, p.investor_count, t.total_investors
  FROM per_pool p
  CROSS JOIN total t;
$$;
