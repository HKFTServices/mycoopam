
CREATE OR REPLACE FUNCTION public.get_cft_control_balances(p_tenant_id uuid, p_up_to_date date DEFAULT NULL)
 RETURNS TABLE(control_account_id uuid, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Balances from actual cashflow_transactions table
  SELECT
    ct.control_account_id,
    COALESCE(SUM(ct.debit) - SUM(ct.credit), 0) AS balance
  FROM public.cashflow_transactions ct
  WHERE ct.tenant_id = p_tenant_id
    AND ct.control_account_id IS NOT NULL
    AND ct.is_active = true
    AND (p_up_to_date IS NULL OR ct.transaction_date <= p_up_to_date)
  GROUP BY ct.control_account_id

  UNION ALL

  -- Balances from legacy CFT data in legacy_id_mappings
  SELECT
    ca_map.new_id::uuid AS control_account_id,
    COALESCE(
      SUM((lm.notes::json->>'Debit')::numeric) - SUM((lm.notes::json->>'Credit')::numeric),
      0
    ) AS balance
  FROM public.legacy_id_mappings lm
  INNER JOIN public.legacy_id_mappings ca_map
    ON ca_map.table_name = 'control_accounts'
    AND ca_map.legacy_id = (lm.notes::json->>'CashAccountID')
    AND ca_map.tenant_id = p_tenant_id
  WHERE lm.table_name = 'cashflow_transactions'
    AND lm.tenant_id = p_tenant_id
    AND (lm.notes::json->>'CashAccountID') IS NOT NULL
    AND (lm.notes::json->>'CashAccountID') != '0'
    AND (p_up_to_date IS NULL OR (lm.notes::json->>'TransactionDate')::date <= p_up_to_date)
  GROUP BY ca_map.new_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_quantities(p_tenant_id uuid, p_up_to_date date DEFAULT NULL)
 RETURNS TABLE(item_id uuid, total_quantity numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT st.item_id, COALESCE(SUM(st.debit) - SUM(st.credit), 0) as total_quantity
  FROM public.stock_transactions st
  WHERE st.tenant_id = p_tenant_id
    AND st.is_active = true
    AND st.item_id IS NOT NULL
    AND (p_up_to_date IS NULL OR st.transaction_date <= p_up_to_date)
  GROUP BY st.item_id;
$function$;
