
-- Fix BLC* accounts: should be Customer (c1aede12-e7fa-4e34-8fa7-7247603e5e44)
UPDATE entity_accounts
SET entity_account_type_id = 'c1aede12-e7fa-4e34-8fa7-7247603e5e44'
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND account_number LIKE 'BLC%'
  AND entity_account_type_id != 'c1aede12-e7fa-4e34-8fa7-7247603e5e44';
