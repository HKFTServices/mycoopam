
ALTER TABLE public.profiles
  ADD COLUMN phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
