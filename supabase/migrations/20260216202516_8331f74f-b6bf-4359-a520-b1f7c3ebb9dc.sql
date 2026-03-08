
-- Outstanding = Payout(1962) + Fees(1975) + Loading(1976) - Repaid(1978) - WriteOff(2002)
CREATE OR REPLACE FUNCTION public.get_loan_outstanding(p_tenant_id uuid)
RETURNS TABLE(
  legacy_entity_id text, entity_id uuid, entity_name text, entity_last_name text,
  total_payout numeric, total_loading numeric, total_loan numeric,
  total_repaid numeric, total_writeoff numeric, outstanding numeric
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
      AND (notes::json->>'Type_TransactionEntryID') IN ('1975', '1976')
  ),
  aggregated AS (
    SELECT
      client_acct_id,
      COALESCE(SUM(CASE WHEN entry_type = '1962' THEN credit ELSE 0 END), 0) AS payout,
      COALESCE(SUM(CASE WHEN entry_type = '1975' THEN debit ELSE 0 END), 0) AS fees,
      COALESCE(SUM(CASE WHEN entry_type = '1976' THEN debit ELSE 0 END), 0) AS loading,
      COALESCE(SUM(CASE WHEN entry_type = '1978' THEN debit ELSE 0 END), 0) AS repaid,
      COALESCE(SUM(CASE WHEN entry_type = '2002' THEN debit ELSE 0 END), 0) AS writeoff
    FROM loan_entries
    WHERE entry_type IN ('1962', '1975', '1976', '1978', '2002')
    GROUP BY client_acct_id
  )
  SELECT
    a.client_acct_id, ea.entity_id, e.name, e.last_name,
    a.payout AS total_payout,
    a.fees + a.loading AS total_loading,
    a.payout + a.fees + a.loading AS total_loan,
    a.repaid AS total_repaid,
    a.writeoff AS total_writeoff,
    (a.payout + a.fees + a.loading) - a.repaid - a.writeoff AS outstanding
  FROM aggregated a
  LEFT JOIN public.entity_accounts ea 
    ON ea.client_account_id = a.client_acct_id::integer AND ea.tenant_id = p_tenant_id
  LEFT JOIN public.entities e ON e.id = ea.entity_id
  ORDER BY ((a.payout + a.fees + a.loading) - a.repaid - a.writeoff) DESC;
END;
$$;

-- Transaction detail: Credit = 1962, 1975, 1976. Debit = 1978, 2002.
CREATE OR REPLACE FUNCTION public.get_loan_transactions(p_tenant_id uuid, p_legacy_entity_id text)
RETURNS TABLE(
  legacy_id text, parent_id text, transaction_date text, entry_type text,
  entry_type_name text, tx_type text, debit numeric, credit numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- CFT: Payout(1962), Repayment(1978), Write-off(2002)
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID'),
    (lm.notes::json->>'TransactionDate'),
    (lm.notes::json->>'Type_TransactionEntryID'),
    COALESCE(tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1962' THEN 'Loans (Payout)'
        WHEN '1978' THEN 'Loan Installment'
        WHEN '2002' THEN 'Loan Write-Off'
        ELSE 'Other (' || (lm.notes::json->>'Type_TransactionEntryID') || ')'
      END
    ),
    (lm.notes::json->>'Type_TransactionID'),
    COALESCE((lm.notes::json->>'Debit')::numeric, 0),
    COALESCE((lm.notes::json->>'Credit')::numeric, 0)
  FROM public.legacy_id_mappings lm
  LEFT JOIN public.legacy_id_mappings tv
    ON tv.table_name = 'gen_type_values'
    AND tv.legacy_id = (lm.notes::json->>'Type_TransactionEntryID')
    AND tv.tenant_id = p_tenant_id
  WHERE lm.table_name = 'cashflow_transactions'
    AND lm.tenant_id = p_tenant_id
    AND (lm.notes::json->>'EntityID') = p_legacy_entity_id
    AND (lm.notes::json->>'Type_TransactionEntryID') IN ('1962', '1978', '2002')

  UNION ALL

  -- BK: Fees(1975), Loading(1976)
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID'),
    (lm.notes::json->>'TransactionDate'),
    (lm.notes::json->>'Type_TransactionEntryID'),
    COALESCE(tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1975' THEN 'Loans (Fees)'
        WHEN '1976' THEN 'Loans (Loading)'
        ELSE 'BK Other'
      END
    ),
    (lm.notes::json->>'Type_TransactionID'),
    COALESCE((lm.notes::json->>'Debit')::numeric, 0),
    COALESCE((lm.notes::json->>'Credit')::numeric, 0)
  FROM public.legacy_id_mappings lm
  LEFT JOIN public.legacy_id_mappings tv
    ON tv.table_name = 'gen_type_values'
    AND tv.legacy_id = (lm.notes::json->>'Type_TransactionEntryID')
    AND tv.tenant_id = p_tenant_id
  WHERE lm.table_name = 'bookkeeping'
    AND lm.tenant_id = p_tenant_id
    AND (lm.notes::json->>'EntityID') = p_legacy_entity_id
    AND (lm.notes::json->>'Type_TransactionEntryID') IN ('1975', '1976')

  ORDER BY transaction_date ASC;
END;
$$;
