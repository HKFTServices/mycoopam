-- Add 'associated_member' to the app_role enum and rename 'member' to 'full_member'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'associated_member';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'full_member';
