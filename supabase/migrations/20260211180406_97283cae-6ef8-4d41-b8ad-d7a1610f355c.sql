
-- OTP verification codes table
CREATE TABLE public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own OTPs"
ON public.otp_verifications FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Auto-cleanup old OTPs (keep last 24h only)
CREATE INDEX idx_otp_expires ON public.otp_verifications (expires_at);
