
UPDATE profiles SET needs_onboarding = false
WHERE needs_onboarding = true
AND user_id IN (
  SELECT uer.user_id FROM user_entity_relationships uer
  WHERE uer.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND uer.is_primary = true
);
