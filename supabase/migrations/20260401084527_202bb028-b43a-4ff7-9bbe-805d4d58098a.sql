
-- Delete the incorrectly created pending bank entries that were saved to AEM
-- instead of Bullion due to the tenant switching bug.
-- These entries all have status 'pending_approval' and were posted by Anneke.
-- They reference AEM's GL accounts/control accounts so cannot be moved.
DELETE FROM cashflow_transactions 
WHERE tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662'
  AND status = 'pending_approval'
  AND is_active = true
  AND posted_by = '9fde6998-e324-4d7c-9670-fd0f46a37ad5';
