-- Allow receivers to view transfer transactions sent to their entity accounts
CREATE POLICY "Receivers can view incoming transfers"
ON public.transactions
FOR SELECT
USING (
  transfer_to_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.entity_accounts ea
    JOIN public.user_entity_relationships uer ON uer.entity_id = ea.entity_id
    WHERE ea.id = transactions.transfer_to_account_id
      AND uer.user_id = auth.uid()
      AND uer.tenant_id = transactions.tenant_id
  )
);