-- Add approval workflow columns to membership_applications
ALTER TABLE public.membership_applications
  ADD COLUMN IF NOT EXISTS first_approved_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_approved_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_approved_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_approved_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text DEFAULT NULL;
