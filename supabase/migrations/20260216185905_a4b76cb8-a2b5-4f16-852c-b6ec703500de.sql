
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH loan_entries AS (
    SELECT 
      (notes::json->>'EntityID') AS entity_id_legacy,
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
  ),
  aggregated AS (
    SELECT
      entity_id_legacy,
      COALESCE(SUM(CASE WHEN entry_type = '1962' THEN credit ELSE 0 END), 0) AS payout,
      COALESCE(SUM(CASE WHEN entry_type = '1980' THEN credit ELSE 0 END), 0) AS total_loan_amt,
      COALESCE(SUM(CASE WHEN entry_type = '1978' THEN debit ELSE 0 END), 0) AS repaid,
      COALESCE(SUM(CASE WHEN entry_type = '2002' THEN debit ELSE 0 END), 0) AS writeoff
    FROM loan_entries
    GROUP BY entity_id_legacy
  )
  SELECT
    a.entity_id_legacy AS legacy_entity_id,
    em.new_id AS entity_id,
    e.name AS entity_name,
    e.last_name AS entity_last_name,
    a.payout AS total_payout,
    a.total_loan_amt - a.payout AS total_loading,
    a.total_loan_amt AS total_loan,
    a.repaid AS total_repaid,
    a.writeoff AS total_writeoff,
    a.total_loan_amt - a.repaid - a.writeoff AS outstanding
  FROM aggregated a
  LEFT JOIN public.legacy_id_mappings em 
    ON em.table_name = 'entities' AND em.legacy_id = a.entity_id_legacy AND em.tenant_id = p_tenant_id
  LEFT JOIN public.entities e ON e.id = em.new_id
  ORDER BY (a.total_loan_amt - a.repaid - a.writeoff) DESC;
END;
$$;
