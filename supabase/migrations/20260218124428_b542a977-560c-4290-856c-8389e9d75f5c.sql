
-- Fix get_cft_control_balances to read directly from cashflow_transactions
-- instead of the legacy_id_mappings table, so new Ledger Entries are included.
CREATE OR REPLACE FUNCTION public.get_cft_control_balances(p_tenant_id uuid)
RETURNS TABLE(control_account_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    control_account_id,
    COALESCE(SUM(debit) - SUM(credit), 0) AS balance
  FROM public.cashflow_transactions
  WHERE tenant_id = p_tenant_id
    AND control_account_id IS NOT NULL
    AND is_active = true
  GROUP BY control_account_id;
$function$;
