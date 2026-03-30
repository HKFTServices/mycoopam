UPDATE public.legacy_id_mappings
SET is_posted = true,
    posted_at = now(),
    posted_by = NULL
WHERE table_name = 'cashflow_transactions'
  AND is_posted = false
  AND notes IS NOT NULL
  AND (
    (notes::json->>'Type_TransactionID') IN ('1912', '1945', '1914')
  )
  AND (notes::json->>'TransactionDate')::date >= '2025-03-01'
  AND (notes::json->>'TransactionDate')::date <= '2026-03-03';