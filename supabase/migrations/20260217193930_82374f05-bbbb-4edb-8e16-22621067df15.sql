-- Add clerk and manager roles to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'clerk';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
