-- Fix relationship types for legal entities that are incorrectly set to "Myself"
-- Trust → Trustee Intervivos Trust
UPDATE user_entity_relationships uer
SET relationship_type_id = 'cfc5fd55-a91e-4931-a3dc-0970af3a0671'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '8fce7d7b-0696-4c97-b78c-3fb5ba9d363f'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Company → Director of Company
UPDATE user_entity_relationships uer
SET relationship_type_id = '0627dc3c-59f7-4dd4-aaf3-db8ca9bf808c'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = 'ecfcd6f5-1de1-49be-a53e-8c7a2c3ccccc'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Co-operative → Director of Co-operative
UPDATE user_entity_relationships uer
SET relationship_type_id = '74804837-aede-4ed9-ae6c-0f0cb9e71fdb'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '47625a13-cb55-436b-a552-3427cb10c40e'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Close Corporation → Member Closed Corporation
UPDATE user_entity_relationships uer
SET relationship_type_id = '2e590ad6-1b47-4fbd-bb5f-ecd26d162a2f'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '64fa63d1-249b-4e01-bfd3-f5a2c3d7695e'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Partnership → Partner in Partnership
UPDATE user_entity_relationships uer
SET relationship_type_id = 'ebe406bf-52e9-447e-8b5b-29cc7db67fe5'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '9fea5746-329f-4c1b-86d8-0f6653dd0968'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Sole Proprietory → Sole Proprietor
UPDATE user_entity_relationships uer
SET relationship_type_id = '42cf5d0e-6a7f-49d2-a9ed-3d93c7f218cb'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '859ce849-19f1-4892-ac27-02de7af3bf2a'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Corporation → Director of Corporation
UPDATE user_entity_relationships uer
SET relationship_type_id = '1e1d58f2-e9e4-4b9a-a11a-90ce6bd628fa'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = 'dfa4952d-cb95-4022-8439-6bb0e7cd7746'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Church → Leader of Church
UPDATE user_entity_relationships uer
SET relationship_type_id = 'a1a790e6-d828-4c59-9b39-af4cdfbb3fe7'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '4d9718e7-50d0-4e05-9b20-13e80ad28993'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Society → Authorized Member of Society
UPDATE user_entity_relationships uer
SET relationship_type_id = 'aff60745-0316-4331-8026-a2dfb66a895d'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = 'b663610b-15b6-4b59-b670-d5dbcd54b161'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Joint Account → Joint account
UPDATE user_entity_relationships uer
SET relationship_type_id = 'bfc487e8-3968-43c3-a1c0-0e336415b3e1'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '17e55f31-694b-4480-9dc5-dd541ae05cd0'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';

-- Political Party → Representative of Political Party
UPDATE user_entity_relationships uer
SET relationship_type_id = 'ec825b62-917a-49da-8651-81872bab8fd1'
FROM entities e
WHERE uer.entity_id = e.id
  AND e.entity_category_id = '2e58637f-23fd-4d1c-9100-0723aa22f707'
  AND uer.relationship_type_id = 'ff74a3e5-b204-4719-8031-18c47f557b8b';