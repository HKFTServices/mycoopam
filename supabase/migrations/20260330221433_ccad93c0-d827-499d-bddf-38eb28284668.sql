UPDATE public.legacy_id_mappings
SET is_posted = true, posted_at = now()
WHERE table_name = 'cashflow_transactions'
  AND is_posted = false
  AND (notes::json->>'Type_TransactionID') IN ('1912', '1945', '1914');