ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS disbursement_reference text,
  ADD COLUMN IF NOT EXISTS disbursement_date date,
  ADD COLUMN IF NOT EXISTS disbursement_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS member_signature_data text,
  ADD COLUMN IF NOT EXISTS admin_signature_data text;