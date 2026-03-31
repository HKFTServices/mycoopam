
INSERT INTO profiles (user_id, email, first_name, last_name, phone)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  e.email_address,
  e.name,
  e.last_name,
  e.contact_number
FROM tenant_memberships tm
JOIN user_entity_relationships uer ON uer.user_id = tm.user_id AND uer.tenant_id = tm.tenant_id
JOIN entities e ON e.id = uer.entity_id
LEFT JOIN profiles p ON p.user_id = tm.user_id
WHERE tm.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND p.user_id IS NULL
ORDER BY tm.user_id, e.created_at ASC
ON CONFLICT (user_id) DO NOTHING;
