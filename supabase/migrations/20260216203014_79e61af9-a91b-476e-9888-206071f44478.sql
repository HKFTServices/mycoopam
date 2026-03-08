
-- Show ALL loan-related entries from CFT and BK in the detail schedule
CREATE OR REPLACE FUNCTION public.get_loan_transactions(p_tenant_id uuid, p_legacy_entity_id text)
RETURNS TABLE(
  legacy_id text, parent_id text, transaction_date text, entry_type text,
  entry_type_name text, tx_type text, debit numeric, credit numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- CFT loan entries: 1962, 1978, 1980, 2002
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID'),
    (lm.notes::json->>'TransactionDate'),
    (lm.notes::json->>'Type_TransactionEntryID'),
    COALESCE(tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1962' THEN 'Loans (Payout)'
        WHEN '1980' THEN 'Member Loan'
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
    AND (
      (lm.notes::json->>'Type_TransactionID') IN ('1959', '2000')
      OR (lm.notes::json->>'Type_TransactionEntryID') = '1978'
    )

  UNION ALL

  -- BK loan entries: 1962, 1975, 1976, 1978, 1984, 2002
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID'),
    (lm.notes::json->>'TransactionDate'),
    (lm.notes::json->>'Type_TransactionEntryID'),
    COALESCE(tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1962' THEN 'Loans (Payout) [BK]'
        WHEN '1975' THEN 'Loans (Fees)'
        WHEN '1976' THEN 'Loans (Loading)'
        WHEN '1978' THEN 'Loan Installment [BK]'
        WHEN '1984' THEN 'Loan FL Receivable (BS)'
        WHEN '2002' THEN 'Loan Write-Off [BK]'
        ELSE 'BK Other (' || (lm.notes::json->>'Type_TransactionEntryID') || ')'
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
    AND (lm.notes::json->>'Type_TransactionEntryID') IN ('1962', '1975', '1976', '1978', '1984', '2002')

  ORDER BY transaction_date ASC;
END;
$$;
