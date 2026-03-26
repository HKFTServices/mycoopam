
-- Add new enum value for stock deposit
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'first_membership_dep_stock';
