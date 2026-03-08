
CREATE OR REPLACE FUNCTION public.get_loan_outstanding(p_tenant_id uuid)
RETURNS TABLE(
  legacy_entity_id text,
  entity_id uuid,
  entity_name text,
  entity_last_name text,
  total_payout numeric,
  total_loading numeric,
  total_loan numeric,
  total_repaid numeric,
  total_writeoff numeric,
  outstanding numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH loan_entries AS (
    SELECT 
      (notes::json->>'EntityID') AS client_acct_id,
      (notes::json->>'Type_TransactionEntryID') AS entry_type,
      COALESCE((notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings
    WHERE table_name = 'cashflow_transactions'
      AND tenant_id = p_tenant_id
      AND (
        (notes::json->>'Type_TransactionEntryID') IN ('1962', '1978', '2002')
        OR (notes::json->>'Type_TransactionID') IN ('1959', '2000')
      )
    UNION ALL
    SELECT 
      (notes::json->>'EntityID') AS client_acct_id,
      (notes::json->>'Type_TransactionEntryID') AS entry_type,
      COALESCE((notes::json->>'Debit')::numeric, 0) AS debit,
      COALESCE((notes::json->>'Credit')::numeric, 0) AS credit
    FROM public.legacy_id_mappings
    WHERE table_name = 'bookkeeping'
      AND tenant_id = p_tenant_id
      AND (notes::json->>'Type_TransactionEntryID') IN ('1975', '1984')
  ),
  aggregated AS (
    SELECT
      client_acct_id,
      COALESCE(SUM(CASE WHEN entry_type = '1962' THEN credit ELSE 0 END), 0) AS payout,
      -- Fees (1975) stored as debits in BK, but represent loan increase
      COALESCE(SUM(CASE WHEN entry_type = '1975' THEN debit ELSE 0 END), 0) AS fees,
      -- Loadings Receivable (1984) stored as credits in BK
      COALESCE(SUM(CASE WHEN entry_type = '1984' THEN credit ELSE 0 END), 0) AS loadings_recv,
      COALESCE(SUM(CASE WHEN entry_type = '1978' THEN debit ELSE 0 END), 0) AS repaid,
      COALESCE(SUM(CASE WHEN entry_type = '2002' THEN debit ELSE 0 END), 0) AS writeoff
    FROM loan_entries
    WHERE entry_type IN ('1962', '1975', '1984', '1978', '2002')
    GROUP BY client_acct_id
  )
  SELECT
    a.client_acct_id AS legacy_entity_id,
    ea.entity_id AS entity_id,
    e.name AS entity_name,
    e.last_name AS entity_last_name,
    a.payout AS total_payout,
    a.fees + a.loadings_recv AS total_loading,
    a.payout + a.fees + a.loadings_recv AS total_loan,
    a.repaid AS total_repaid,
    a.writeoff AS total_writeoff,
    (a.payout + a.fees + a.loadings_recv) - a.repaid - a.writeoff AS outstanding
  FROM aggregated a
  LEFT JOIN public.entity_accounts ea 
    ON ea.client_account_id = a.client_acct_id::integer AND ea.tenant_id = p_tenant_id
  LEFT JOIN public.entities e ON e.id = ea.entity_id
  ORDER BY ((a.payout + a.fees + a.loadings_recv) - a.repaid - a.writeoff) DESC;
END;
$$;
