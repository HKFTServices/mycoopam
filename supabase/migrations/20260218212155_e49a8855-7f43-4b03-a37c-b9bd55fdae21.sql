-- Allow receivers to accept/reject incoming transfers by updating receiver_approved_at and receiver_approved_by
CREATE POLICY "Receivers can update incoming transfer acceptance"
ON public.transactions
FOR UPDATE
USING (
  transfer_to_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM entity_accounts ea
    JOIN user_entity_relationships uer ON uer.entity_id = ea.entity_id
    WHERE ea.id = transactions.transfer_to_account_id
      AND uer.user_id = auth.uid()
      AND uer.tenant_id = transactions.tenant_id
  )
)
WITH CHECK (
  transfer_to_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM entity_accounts ea
    JOIN user_entity_relationships uer ON uer.entity_id = ea.entity_id
    WHERE ea.id = transactions.transfer_to_account_id
      AND uer.user_id = auth.uid()
      AND uer.tenant_id = transactions.tenant_id
  )
);