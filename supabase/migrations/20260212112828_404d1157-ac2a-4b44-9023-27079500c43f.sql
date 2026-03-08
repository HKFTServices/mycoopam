
-- Add unique constraint to prevent duplicate legacy mappings
ALTER TABLE public.legacy_id_mappings 
ADD CONSTRAINT legacy_id_mappings_unique_entry 
UNIQUE (tenant_id, table_name, legacy_id);
