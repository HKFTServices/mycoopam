-- Add approval workflow columns to transaction_types
ALTER TABLE public.transaction_types
  ADD COLUMN IF NOT EXISTS initiator_role text NOT NULL DEFAULT 'full_member',
  ADD COLUMN IF NOT EXISTS first_approval_role text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_approval_role text DEFAULT NULL;

COMMENT ON COLUMN public.transaction_types.initiator_role IS 'Role that can initiate this transaction type (e.g. full_member, clerk)';
COMMENT ON COLUMN public.transaction_types.first_approval_role IS 'Role for first approval step (e.g. clerk). NULL means no first approval needed.';
COMMENT ON COLUMN public.transaction_types.final_approval_role IS 'Role for final approval step (e.g. manager, tenant_admin). NULL means no final approval needed.';
