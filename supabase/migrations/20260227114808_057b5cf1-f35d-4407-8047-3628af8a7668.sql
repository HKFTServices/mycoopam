
-- Add needs_onboarding flag to profiles
ALTER TABLE public.profiles ADD COLUMN needs_onboarding boolean NOT NULL DEFAULT true;

-- Set false for admin users (they don't need onboarding)
UPDATE public.profiles SET needs_onboarding = false
WHERE user_id IN (
  SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('super_admin', 'tenant_admin')
);
