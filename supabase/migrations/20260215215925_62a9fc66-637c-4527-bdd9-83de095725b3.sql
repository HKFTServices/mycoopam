
CREATE OR REPLACE FUNCTION public.get_account_pool_units(p_tenant_id uuid)
 RETURNS TABLE(entity_account_id uuid, pool_id uuid, total_units numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT ut.entity_account_id, ut.pool_id, COALESCE(SUM(ut.debit) - SUM(ut.credit), 0) as total_units
  FROM public.unit_transactions ut
  WHERE ut.tenant_id = p_tenant_id
    AND ut.is_active = true
    AND ut.entity_account_id IS NOT NULL
  GROUP BY ut.entity_account_id, ut.pool_id;
$$;
