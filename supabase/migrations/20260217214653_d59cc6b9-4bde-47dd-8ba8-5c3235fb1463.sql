-- Add status tracking columns to referrers table for approval workflow
ALTER TABLE public.referrers 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS rejected_by uuid NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL,
  ADD COLUMN IF NOT EXISTS entity_id uuid NULL;

-- Add foreign key for entity_id (the natural person entity applying)
ALTER TABLE public.referrers
  ADD CONSTRAINT referrers_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id);

-- Update existing referrer records to 'approved' status
UPDATE public.referrers SET status = 'approved' WHERE is_active = true;

-- Add RLS policies for referrers (currently missing)
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active referrers"
  ON public.referrers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert referrer applications"
  ON public.referrers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can update referrers"
  ON public.referrers FOR UPDATE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_tenant_role(auth.uid(), 'tenant_admin'::app_role, tenant_id) OR
    has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id)
  );

CREATE POLICY "Users can view own referrer applications"
  ON public.referrers FOR SELECT
  USING (auth.uid() = user_id);