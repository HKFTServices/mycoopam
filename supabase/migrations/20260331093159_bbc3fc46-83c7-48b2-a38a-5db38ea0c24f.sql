
-- 1. Activate ALL Bullion tenant memberships
UPDATE tenant_memberships SET is_active = true
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5' AND is_active = false;

-- 2. Create missing user_entity_relationships for Bullion members
-- Match users to their Bullion entities by email address
INSERT INTO user_entity_relationships (user_id, entity_id, tenant_id, relationship_type_id, is_primary)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  e.id AS entity_id,
  'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'::uuid,
  'ff74a3e5-b204-4719-8031-18c47f557b8b'::uuid, -- "Myself"
  true
FROM tenant_memberships tm
JOIN profiles p ON p.user_id = tm.user_id
JOIN entities e ON e.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND lower(trim(e.email_address)) = lower(trim(p.email))
LEFT JOIN user_entity_relationships uer
  ON uer.user_id = tm.user_id AND uer.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5' AND uer.is_primary = true
WHERE tm.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND uer.id IS NULL
ON CONFLICT DO NOTHING;

-- 3. Update registration_status to 'registered' for all Bullion members who now have entity relationships
UPDATE profiles SET registration_status = 'registered'
WHERE registration_status = 'incomplete'
AND user_id IN (
  SELECT uer.user_id FROM user_entity_relationships uer
  WHERE uer.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND uer.is_primary = true
);
