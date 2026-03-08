
-- Update get_loan_outstanding to include BK entries (1975=Fees, 1976=Loading, 1984=Loadings Receivable)
CREATE OR REPLACE FUNCTION public.get_loan_outstanding(p_tenant_id uuid)
 RETURNS TABLE(legacy_entity_id text, entity_id uuid, entity_name text, entity_last_name text, total_payout numeric, total_loading numeric, total_loan numeric, total_repaid numeric, total_writeoff numeric, outstanding numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH loan_entries AS (
    -- CFT loan entries
    SELECT 
      (notes::json->>'EntityID') AS client_acct_id,
      (notes::json->>'Type_TransactionEntryID') AS entry_type,
      COALESCE((notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings
    WHERE table_name = 'cashflow_transactions'
      AND tenant_id = p_tenant_id
      AND (
        (notes::json->>'Type_TransactionID') IN ('1959', '2000')
        OR (notes::json->>'Type_TransactionEntryID') = '1978'
      )
    UNION ALL
    -- BK loan entries (fees, loading, loadings receivable)
    SELECT 
      (notes::json->>'EntityID') AS client_acct_id,
      (notes::json->>'Type_TransactionEntryID') AS entry_type,
      COALESCE((notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings
    WHERE table_name = 'bookkeeping'
      AND tenant_id = p_tenant_id
      AND (notes::json->>'Type_TransactionEntryID') IN ('1975', '1976', '1984')
  ),
  aggregated AS (
    SELECT
      client_acct_id,
      COALESCE(SUM(CASE WHEN entry_type = '1962' THEN credit ELSE 0 END), 0) AS payout,
      COALESCE(SUM(CASE WHEN entry_type = '1980' THEN credit ELSE 0 END), 0) AS total_loan_amt,
      COALESCE(SUM(CASE WHEN entry_type = '1978' THEN debit ELSE 0 END), 0) AS repaid,
      COALESCE(SUM(CASE WHEN entry_type = '2002' THEN debit ELSE 0 END), 0) AS writeoff,
      -- BK extras: fees and loadings add to the loan balance
      COALESCE(SUM(CASE WHEN entry_type IN ('1975', '1976', '1984') THEN (debit - credit) ELSE 0 END), 0) AS bk_extras
    FROM loan_entries
    GROUP BY client_acct_id
  )
  SELECT
    a.client_acct_id AS legacy_entity_id,
    ea.entity_id AS entity_id,
    e.name AS entity_name,
    e.last_name AS entity_last_name,
    a.payout AS total_payout,
    (a.total_loan_amt - a.payout) + a.bk_extras AS total_loading,
    a.total_loan_amt + a.bk_extras AS total_loan,
    a.repaid AS total_repaid,
    a.writeoff AS total_writeoff,
    (a.total_loan_amt + a.bk_extras) - a.repaid - a.writeoff AS outstanding
  FROM aggregated a
  LEFT JOIN public.entity_accounts ea 
    ON ea.client_account_id = a.client_acct_id::integer AND ea.tenant_id = p_tenant_id
  LEFT JOIN public.entities e ON e.id = ea.entity_id
  ORDER BY ((a.total_loan_amt + a.bk_extras) - a.repaid - a.writeoff) DESC;
END;
$function$;

-- Update get_loan_transactions to include BK entries
CREATE OR REPLACE FUNCTION public.get_loan_transactions(p_tenant_id uuid, p_legacy_entity_id text)
 RETURNS TABLE(legacy_id text, parent_id text, transaction_date text, entry_type text, entry_type_name text, tx_type text, debit numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- CFT entries
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID') AS parent_id,
    (lm.notes::json->>'TransactionDate') AS transaction_date,
    (lm.notes::json->>'Type_TransactionEntryID') AS entry_type,
    COALESCE(
      tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1962' THEN 'Loan Payout'
        WHEN '1980' THEN 'Member Loan (incl Loading)'
        WHEN '1978' THEN 'Loan Instalment'
        WHEN '2002' THEN 'Loan Write-Off'
        ELSE 'Other (' || (lm.notes::json->>'Type_TransactionEntryID') || ')'
      END
    ) AS entry_type_name,
    (lm.notes::json->>'Type_TransactionID') AS tx_type,
    COALESCE((lm.notes::json->>'Debit')::numeric, 0) AS debit,
    COALESCE((lm.notes::json->>'Credit')::numeric, 0) AS credit
  FROM public.legacy_id_mappings lm
  LEFT JOIN public.legacy_id_mappings tv
    ON tv.table_name = 'gen_type_values'
    AND tv.legacy_id = (lm.notes::json->>'Type_TransactionEntryID')
    AND tv.tenant_id = p_tenant_id
  WHERE lm.table_name = 'cashflow_transactions'
    AND lm.tenant_id = p_tenant_id
    AND (lm.notes::json->>'EntityID') = p_legacy_entity_id
    AND (
      (lm.notes::json->>'Type_TransactionID') IN ('1959', '2000')
      OR (lm.notes::json->>'Type_TransactionEntryID') = '1978'
    )

  UNION ALL

  -- BK entries (fees, loading, loadings receivable)
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID') AS parent_id,
    (lm.notes::json->>'TransactionDate') AS transaction_date,
    (lm.notes::json->>'Type_TransactionEntryID') AS entry_type,
    COALESCE(
      tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1975' THEN 'Loan Fees'
        WHEN '1976' THEN 'Loan Loading'
        WHEN '1984' THEN 'Loadings Receivable'
        ELSE 'BK Other (' || (lm.notes::json->>'Type_TransactionEntryID') || ')'
      END
    ) AS entry_type_name,
    (lm.notes::json->>'Type_TransactionID') AS tx_type,
    COALESCE((lm.notes::json->>'Debit')::numeric, 0) AS debit,
    COALESCE((lm.notes::json->>'Credit')::numeric, 0) AS credit
  FROM public.legacy_id_mappings lm
  LEFT JOIN public.legacy_id_mappings tv
    ON tv.table_name = 'gen_type_values'
    AND tv.legacy_id = (lm.notes::json->>'Type_TransactionEntryID')
    AND tv.tenant_id = p_tenant_id
  WHERE lm.table_name = 'bookkeeping'
    AND lm.tenant_id = p_tenant_id
    AND (lm.notes::json->>'EntityID') = p_legacy_entity_id
    AND (lm.notes::json->>'Type_TransactionEntryID') IN ('1975', '1976', '1984')

  ORDER BY transaction_date ASC;
END;
$function$;
