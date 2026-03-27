-- Replace hardcoded AEM references with merge fields in the AEM template tenant's T&C
-- AEM tenant_id = 38814f34-6870-468e-8539-073ea4356088

-- English membership T&C
UPDATE terms_conditions
SET content = REPLACE(
  REPLACE(
    REPLACE(content, 'AEM Proviso Co-operation Limited', '{{tenant_name}}'),
    'AEM Proviso Co-operation', '{{tenant_name}}'
  ),
  '("AEM")', '("{{tenant_short_name}}")'
)
WHERE tenant_id = '38814f34-6870-468e-8539-073ea4356088'
  AND condition_type = 'membership'
  AND language_code = 'en';

-- Afrikaans membership T&C
UPDATE terms_conditions
SET content = REPLACE(
  REPLACE(
    REPLACE(content, 'AEM Proviso Kooperasie Beperk', '{{tenant_name}}'),
    'AEM Proviso Koöperasie Beperk', '{{tenant_name}}'
  ),
  '("AEM")', '("{{tenant_short_name}}")'
)
WHERE tenant_id = '38814f34-6870-468e-8539-073ea4356088'
  AND condition_type = 'membership'
  AND language_code = 'af';

-- Catch remaining standalone "AEM" references in all AEM T&C records (careful replace)
UPDATE terms_conditions
SET content = REPLACE(content, '>AEM<', '>{{tenant_short_name}}<')
WHERE tenant_id = '38814f34-6870-468e-8539-073ea4356088'
  AND content LIKE '%>AEM<%';

-- Also replace " AEM " (with spaces) in content 
UPDATE terms_conditions
SET content = REPLACE(content, ' AEM ', ' {{tenant_short_name}} ')
WHERE tenant_id = '38814f34-6870-468e-8539-073ea4356088'
  AND content LIKE '% AEM %';

-- Also do the same for any PMC tenant records that were cloned with AEM references
UPDATE terms_conditions
SET content = REPLACE(
  REPLACE(
    REPLACE(content, 'AEM Proviso Co-operation Limited', '{{tenant_name}}'),
    'AEM Proviso Co-operation', '{{tenant_name}}'
  ),
  '("AEM")', '("{{tenant_short_name}}")'
)
WHERE content LIKE '%AEM Proviso%';

UPDATE terms_conditions
SET content = REPLACE(content, ' AEM ', ' {{tenant_short_name}} ')
WHERE content LIKE '% AEM %';