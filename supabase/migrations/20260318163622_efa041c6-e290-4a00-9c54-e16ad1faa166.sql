CREATE OR REPLACE FUNCTION public.get_legacy_cft_for_entity(
  p_tenant_id uuid,
  p_entity_id uuid,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE(
  legacy_id text,
  transaction_date text,
  entry_type text,
  description text,
  pool_name text,
  debit numeric,
  credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'TransactionDate')::text,
    COALESCE(tv.description, 'Entry ' || (lm.notes::json->>'Type_TransactionEntryID')) AS entry_type,
    COALESCE(tt.description, '') AS description,
    COALESCE(ca_pool.name, '') AS pool_name,
    COALESCE((lm.notes::json->>'Debit')::numeric, 0) AS debit,
    COALESCE((lm.notes::json->>'Credit')::numeric, 0) AS credit
  FROM public.legacy_id_mappings lm
  INNER JOIN public.entity_accounts ea
    ON ea.client_account_id = (lm.notes::json->>'EntityID')::integer
    AND ea.tenant_id = p_tenant_id
    AND ea.entity_id = p_entity_id
  LEFT JOIN public.legacy_id_mappings tv
    ON tv.table_name = 'gen_type_values'
    AND tv.legacy_id = (lm.notes::json->>'Type_TransactionEntryID')
    AND tv.tenant_id = p_tenant_id
  LEFT JOIN public.legacy_id_mappings tt
    ON tt.table_name = 'gen_type_values'
    AND tt.legacy_id = (lm.notes::json->>'Type_TransactionID')
    AND tt.tenant_id = p_tenant_id
  LEFT JOIN (
    SELECT ca2.legacy_id AS cash_acct_id, p2.name
    FROM public.legacy_id_mappings ca2
    JOIN public.control_accounts ca3 ON ca3.id = ca2.new_id::uuid
    JOIN public.pools p2 ON p2.id = ca3.pool_id
    WHERE ca2.table_name = 'control_accounts' AND ca2.tenant_id = p_tenant_id
  ) ca_pool ON ca_pool.cash_acct_id = (lm.notes::json->>'CashAccountID')
  WHERE lm.table_name = 'cashflow_transactions'
    AND lm.tenant_id = p_tenant_id
    AND (p_from_date IS NULL OR (lm.notes::json->>'TransactionDate')::date >= p_from_date)
    AND (p_to_date IS NULL OR (lm.notes::json->>'TransactionDate')::date <= p_to_date)
  ORDER BY (lm.notes::json->>'TransactionDate')::date ASC;
END;
$$;