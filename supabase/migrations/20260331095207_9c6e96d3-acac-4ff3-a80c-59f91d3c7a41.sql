
-- Fix systemic account type mismatch for Bullion tenant
-- BB* accounts should be Membership (9b8cbe4f-c7ed-4850-b6b4-0f2ebf6b7a5c)
UPDATE entity_accounts
SET entity_account_type_id = '9b8cbe4f-c7ed-4850-b6b4-0f2ebf6b7a5c'
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND account_number LIKE 'BB%'
  AND entity_account_type_id != '9b8cbe4f-c7ed-4850-b6b4-0f2ebf6b7a5c';

-- BLRH* accounts should be Referral House (26314ab4-31c8-4e55-9c76-3aae9ca5d097)
UPDATE entity_accounts
SET entity_account_type_id = '26314ab4-31c8-4e55-9c76-3aae9ca5d097'
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND account_number LIKE 'BLRH%'
  AND entity_account_type_id != '26314ab4-31c8-4e55-9c76-3aae9ca5d097';

-- BLS* accounts should be Supplier (e2f50a9d-ec62-4a2c-b34a-a2fc582de1fd)
UPDATE entity_accounts
SET entity_account_type_id = 'e2f50a9d-ec62-4a2c-b34a-a2fc582de1fd'
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND account_number LIKE 'BLS%'
  AND entity_account_type_id != 'e2f50a9d-ec62-4a2c-b34a-a2fc582de1fd';

-- Update Johan Keyser's profile email
UPDATE profiles
SET email = 'johan@bullionlimited.co.za'
WHERE user_id = '349ec622-ddb1-4b63-bf0b-c8ed41bba86f';
