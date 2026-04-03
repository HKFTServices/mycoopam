-- Add referral_house to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'referral_house';