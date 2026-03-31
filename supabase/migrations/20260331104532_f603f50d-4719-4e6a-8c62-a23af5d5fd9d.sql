
-- Make user_id nullable on referrers for legacy referrers without user accounts
ALTER TABLE public.referrers ALTER COLUMN user_id DROP NOT NULL;
