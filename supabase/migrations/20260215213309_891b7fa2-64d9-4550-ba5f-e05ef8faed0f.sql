
CREATE OR REPLACE FUNCTION public.get_cft_control_balances(p_tenant_id uuid)
 RETURNS TABLE(control_account_id uuid, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH cft_records AS (
    SELECT 
      (notes::json->>'CashAccountID') AS legacy_ca_id,
      COALESCE((notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings
    WHERE table_name = 'cashflow_transactions'
      AND tenant_id = p_tenant_id
      AND notes IS NOT NULL
      AND (notes::json->>'CashAccountID') IS NOT NULL
      AND (notes::json->>'CashAccountID') != '0'
  ),
  mapped AS (
    SELECT 
      lm.new_id AS control_account_id,
      cr.debit,
      cr.credit
    FROM cft_records cr
    JOIN public.legacy_id_mappings lm 
      ON lm.table_name = 'control_accounts'
      AND lm.legacy_id = cr.legacy_ca_id
      AND lm.tenant_id = p_tenant_id
  )
  SELECT 
    control_account_id,
    COALESCE(SUM(debit) - SUM(credit), 0) AS balance
  FROM mapped
  GROUP BY control_account_id;
$$;
