
-- Fix Johan Keyser specifically: link to his Bullion entity
INSERT INTO user_entity_relationships (user_id, entity_id, tenant_id, relationship_type_id, is_primary)
VALUES (
  '349ec622-ddb1-4b63-bf0b-c8ed41bba86f',
  '623d0dc0-cd1e-4a54-b196-25b9c02f7474',
  'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5',
  'ff74a3e5-b204-4719-8031-18c47f557b8b',
  true
) ON CONFLICT DO NOTHING;

-- Update his profile status
UPDATE profiles SET registration_status = 'registered'
WHERE user_id = '349ec622-ddb1-4b63-bf0b-c8ed41bba86f';

-- Link remaining unmatched Bullion users to entities by matching first_name + last_name
INSERT INTO user_entity_relationships (user_id, entity_id, tenant_id, relationship_type_id, is_primary)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  e.id,
  'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'::uuid,
  'ff74a3e5-b204-4719-8031-18c47f557b8b'::uuid,
  true
FROM tenant_memberships tm
JOIN profiles p ON p.user_id = tm.user_id
JOIN entities e ON e.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND lower(trim(e.name)) = lower(trim(p.first_name))
  AND lower(trim(e.last_name)) = lower(trim(p.last_name))
LEFT JOIN user_entity_relationships uer
  ON uer.user_id = tm.user_id AND uer.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5' AND uer.is_primary = true
WHERE tm.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND uer.id IS NULL
  AND p.first_name IS NOT NULL AND p.first_name != ''
  AND p.last_name IS NOT NULL AND p.last_name != ''
ON CONFLICT DO NOTHING;

-- Mark all newly linked users as registered
UPDATE profiles SET registration_status = 'registered'
WHERE registration_status = 'incomplete'
AND user_id IN (
  SELECT uer.user_id FROM user_entity_relationships uer
  WHERE uer.tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5'
  AND uer.is_primary = true
);
