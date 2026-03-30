
CREATE OR REPLACE FUNCTION public.get_cft_control_balances(p_tenant_id uuid, p_up_to_date date DEFAULT NULL::date)
 RETURNS TABLE(control_account_id uuid, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  -- EXCLUDE entries whose parent transaction has been posted to live table
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
    -- Exclude legacy entries whose parent transaction has been posted to live table
    AND NOT EXISTS (
      SELECT 1 FROM public.cashflow_transactions ct2
      WHERE ct2.legacy_transaction_id = (lm.notes::json->>'ParentID')
        AND ct2.tenant_id = p_tenant_id
        AND ct2.is_active = true
    )
  GROUP BY ca_map.new_id;
$$;
