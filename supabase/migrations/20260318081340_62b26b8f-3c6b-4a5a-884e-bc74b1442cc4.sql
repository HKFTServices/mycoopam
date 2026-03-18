
CREATE OR REPLACE FUNCTION public.get_pool_units(p_tenant_id uuid, p_up_to_date date DEFAULT NULL)
 RETURNS TABLE(pool_id uuid, total_units numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT ut.pool_id, COALESCE(SUM(ut.debit) - SUM(ut.credit), 0) as total_units
  FROM public.unit_transactions ut
  WHERE ut.tenant_id = p_tenant_id
    AND ut.is_active = true
    AND (p_up_to_date IS NULL OR ut.transaction_date <= p_up_to_date)
  GROUP BY ut.pool_id;
$$;

CREATE OR REPLACE FUNCTION public.get_account_pool_units(p_tenant_id uuid, p_up_to_date date DEFAULT NULL)
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
    AND (p_up_to_date IS NULL OR ut.transaction_date <= p_up_to_date)
  GROUP BY ut.entity_account_id, ut.pool_id;
$$;
