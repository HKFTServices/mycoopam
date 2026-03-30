
ALTER TABLE public.legacy_id_mappings
  ADD COLUMN IF NOT EXISTS is_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

CREATE INDEX IF NOT EXISTS idx_legacy_id_mappings_is_posted
  ON public.legacy_id_mappings (tenant_id, table_name, is_posted)
  WHERE is_posted = false;
