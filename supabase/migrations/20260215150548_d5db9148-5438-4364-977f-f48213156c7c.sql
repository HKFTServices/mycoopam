
-- Add legacy_transaction_id to member_shares for CFT parent linkage
ALTER TABLE public.member_shares 
ADD COLUMN legacy_transaction_id TEXT;

-- Add index for lookups
CREATE INDEX idx_member_shares_legacy_txn_id ON public.member_shares(legacy_transaction_id);
