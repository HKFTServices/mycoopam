
-- Allow tenant members to look up other approved member accounts by account number
-- This is needed for the Transfer recipient lookup feature
CREATE POLICY "Tenant members can look up approved entity accounts"
  ON public.entity_accounts
  FOR SELECT
  USING (
    is_approved = true
    AND is_tenant_member(auth.uid(), tenant_id)
  );
