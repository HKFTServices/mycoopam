CREATE OR REPLACE FUNCTION public.get_loan_transactions(p_tenant_id uuid, p_legacy_entity_id text)
 RETURNS TABLE(legacy_id text, parent_id text, transaction_date text, entry_type text, entry_type_name text, tx_type text, debit numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    lm.legacy_id,
    (lm.notes::json->>'ParentID'),
    (lm.notes::json->>'TransactionDate'),
    (lm.notes::json->>'Type_TransactionEntryID'),
    COALESCE(
      tv.description,
      (lm.notes::json->>'TransactionType'),
      'Unknown (' || (lm.notes::json->>'Type_TransactionEntryID') || ')'
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
    AND (lm.notes::json->>'TransactionType') ILIKE '%loan%'
  ORDER BY (lm.notes::json->>'TransactionDate') ASC;
END;
$function$