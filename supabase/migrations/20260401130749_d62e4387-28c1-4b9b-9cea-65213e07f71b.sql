
-- Fix existing entity_documents that have no document_type_id but have a description like "TypeName: FileName"
UPDATE entity_documents ed
SET document_type_id = dt.id
FROM document_types dt
WHERE ed.document_type_id IS NULL
  AND ed.description IS NOT NULL
  AND ed.description LIKE '%:%'
  AND dt.tenant_id = ed.tenant_id
  AND dt.is_active = true
  AND LOWER(TRIM(SPLIT_PART(ed.description, ':', 1))) = LOWER(dt.name);
