-- Add referrer tracking columns to entity_accounts
ALTER TABLE public.entity_accounts
ADD COLUMN referrer_id uuid REFERENCES public.referrers(id) DEFAULT NULL,
ADD COLUMN commission_percentage numeric DEFAULT 0;

-- Index for efficient lookups
CREATE INDEX idx_entity_accounts_referrer_id ON public.entity_accounts(referrer_id) WHERE referrer_id IS NOT NULL;