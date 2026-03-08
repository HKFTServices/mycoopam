
CREATE OR REPLACE FUNCTION public.get_loan_transactions(p_tenant_id uuid, p_legacy_entity_id text)
RETURNS TABLE(
  legacy_id text,
  parent_id text,
  transaction_date text,
  entry_type text,
  entry_type_name text,
  tx_type text,
  debit numeric,
  credit numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID') AS parent_id,
    (lm.notes::json->>'TransactionDate') AS transaction_date,
    (lm.notes::json->>'Type_TransactionEntryID') AS entry_type,
    COALESCE(
      tv.description,
      CASE (lm.notes::json->>'Type_TransactionEntryID')
        WHEN '1962' THEN 'Loans (Payout)'
        WHEN '1980' THEN 'Member Loan'
        WHEN '1978' THEN 'Loan Installment'
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
  ORDER BY transaction_date ASC;
END;
$$;
