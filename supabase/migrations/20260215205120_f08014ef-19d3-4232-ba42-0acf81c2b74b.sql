
CREATE OR REPLACE FUNCTION public.get_pool_units(p_tenant_id uuid)
RETURNS TABLE(pool_id uuid, total_units numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ut.pool_id, COALESCE(SUM(ut.debit) - SUM(ut.credit), 0) as total_units
  FROM public.unit_transactions ut
  WHERE ut.tenant_id = p_tenant_id
    AND ut.is_active = true
  GROUP BY ut.pool_id;
$$;
