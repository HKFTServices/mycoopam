
CREATE OR REPLACE FUNCTION public.get_loan_outstanding(p_tenant_id uuid)
 RETURNS TABLE(legacy_entity_id text, entity_id uuid, entity_name text, entity_last_name text, total_payout numeric, total_loading numeric, total_loan numeric, total_repaid numeric, total_writeoff numeric, outstanding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH loan_entries AS (
    SELECT
      (lm.notes::json->>'EntityID') AS client_acct_id,
      (lm.notes::json->>'TransactionType') AS tx_type,
      COALESCE((lm.notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((lm.notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings lm
    WHERE lm.table_name = 'bookkeeping'
      AND lm.tenant_id = p_tenant_id
      AND (
        (lm.notes::json->>'TransactionType') ILIKE '%loan%'
      )
  ),
  aggregated AS (
    SELECT
      client_acct_id,
      COALESCE(SUM(debit), 0) AS total_debit,
      COALESCE(SUM(credit), 0) AS total_credit
    FROM loan_entries
    GROUP BY client_acct_id
  )
  SELECT
    a.client_acct_id,
    ea.entity_id,
    e.name,
    e.last_name,
    a.total_debit AS total_payout,
    0::numeric AS total_loading,
    a.total_debit AS total_loan,
    a.total_credit AS total_repaid,
    0::numeric AS total_writeoff,
    a.total_debit - a.total_credit AS outstanding
  FROM aggregated a
  LEFT JOIN public.entity_accounts ea
    ON ea.client_account_id = a.client_acct_id::integer AND ea.tenant_id = p_tenant_id
  LEFT JOIN public.entities e ON e.id = ea.entity_id
  ORDER BY (a.total_debit - a.total_credit) DESC;
END;
$function$;
