
CREATE OR REPLACE FUNCTION public.get_stock_quantities(p_tenant_id uuid)
RETURNS TABLE(item_id uuid, total_quantity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT st.item_id, COALESCE(SUM(st.debit) - SUM(st.credit), 0) as total_quantity
  FROM public.stock_transactions st
  WHERE st.tenant_id = p_tenant_id
    AND st.is_active = true
    AND st.item_id IS NOT NULL
  GROUP BY st.item_id;
$$;
