
INSERT INTO profiles (user_id, email)
SELECT tm.user_id, lm.legacy_id
FROM tenant_memberships tm
JOIN legacy_id_mappings lm ON lm.table_name = 'users' AND lm.new_id::text = tm.user_id::text AND lm.tenant_id = tm.tenant_id
LEFT JOIN profiles p ON p.user_id = tm.user_id
WHERE tm.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
