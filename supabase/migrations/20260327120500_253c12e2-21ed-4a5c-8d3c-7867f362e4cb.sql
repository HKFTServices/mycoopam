-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  actor_user_id uuid,
  category text NOT NULL DEFAULT 'general',
  event text NOT NULL DEFAULT '',
  title text NOT NULL,
  body text,
  status text,
  related_table text,
  related_id uuid,
  meta jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_notifications_recipient ON public.notifications (tenant_id, recipient_user_id, read_at);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Admins can insert notifications for their tenant
CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
  );

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create get_pool_investor_stats function
-- Returns per-pool investor count (distinct entity accounts with units > 0)
CREATE OR REPLACE FUNCTION public.get_pool_investor_stats(p_tenant_id uuid)
RETURNS TABLE(pool_id uuid, investor_count bigint, total_investors bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pool_investors AS (
    SELECT
      ut.pool_id,
      ut.entity_account_id,
      COALESCE(SUM(ut.debit) - SUM(ut.credit), 0) AS net_units
    FROM public.unit_transactions ut
    WHERE ut.tenant_id = p_tenant_id
      AND ut.is_active = true
      AND ut.entity_account_id IS NOT NULL
    GROUP BY ut.pool_id, ut.entity_account_id
    HAVING COALESCE(SUM(ut.debit) - SUM(ut.credit), 0) > 0
  ),
  total AS (
    SELECT COUNT(DISTINCT entity_account_id) AS total_investors
    FROM pool_investors
  )
  SELECT
    pi.pool_id,
    COUNT(DISTINCT pi.entity_account_id) AS investor_count,
    t.total_investors
  FROM pool_investors pi
  CROSS JOIN total t
  GROUP BY pi.pool_id, t.total_investors;
$$;