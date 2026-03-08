
-- Add security settings columns
ALTER TABLE public.tenant_configuration
  ADD COLUMN use_default_security boolean NOT NULL DEFAULT true,
  ADD COLUMN require_digit boolean NOT NULL DEFAULT true,
  ADD COLUMN require_lowercase boolean NOT NULL DEFAULT true,
  ADD COLUMN require_non_alphanumeric boolean NOT NULL DEFAULT false,
  ADD COLUMN require_uppercase boolean NOT NULL DEFAULT true,
  ADD COLUMN required_length integer NOT NULL DEFAULT 6,
  ADD COLUMN enable_lockout boolean NOT NULL DEFAULT false,
  ADD COLUMN max_failed_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN lockout_duration_seconds integer NOT NULL DEFAULT 300;

-- Add SMTP settings columns
ALTER TABLE public.tenant_configuration
  ADD COLUMN smtp_host text,
  ADD COLUMN smtp_port integer DEFAULT 587,
  ADD COLUMN smtp_username text,
  ADD COLUMN smtp_password text,
  ADD COLUMN smtp_from_email text,
  ADD COLUMN smtp_from_name text,
  ADD COLUMN smtp_enable_ssl boolean NOT NULL DEFAULT true;

-- Add logo column
ALTER TABLE public.tenant_configuration
  ADD COLUMN logo_url text;
