-- Fix missing profile for PM Connect admin user
INSERT INTO public.profiles (user_id, email, first_name, last_name, registration_status, needs_onboarding)
VALUES ('5ca0f37d-4816-4a26-97fb-f8319ae3e266', 'orders@pmconnect.co.za', 'Peiter', 'Uys', 'registered', false)
ON CONFLICT (user_id) DO NOTHING;

-- Confirm the user's email
UPDATE auth.users SET email_confirmed_at = now() WHERE id = '5ca0f37d-4816-4a26-97fb-f8319ae3e266' AND email_confirmed_at IS NULL;