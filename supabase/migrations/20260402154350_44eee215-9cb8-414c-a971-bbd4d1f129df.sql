UPDATE public.cashflow_transactions
SET is_active = false,
    updated_at = now()
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND legacy_transaction_id IN ('1183', '1272')
  AND is_active = true;

UPDATE public.legacy_id_mappings
SET is_posted = false,
    posted_at = NULL,
    posted_by = NULL
WHERE table_name = 'cashflow_transactions'
  AND tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND legacy_id IN ('1183', '1272');