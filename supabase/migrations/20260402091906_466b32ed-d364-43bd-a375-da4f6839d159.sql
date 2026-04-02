-- Drop the overload without the date parameter to avoid PostgREST ambiguity
DROP FUNCTION IF EXISTS public.get_stock_quantities(uuid);

-- Recreate the single version with optional date parameter
CREATE OR REPLACE FUNCTION public.get_stock_quantities(p_tenant_id uuid, p_up_to_date date DEFAULT NULL::date)
 RETURNS TABLE(item_id uuid, total_quantity numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT st.item_id, COALESCE(SUM(st.debit) - SUM(st.credit), 0) as total_quantity
  FROM public.stock_transactions st
  WHERE st.tenant_id = p_tenant_id
    AND st.is_active = true
    AND st.item_id IS NOT NULL
    AND (p_up_to_date IS NULL OR st.transaction_date <= p_up_to_date)
  GROUP BY st.item_id;
$$;