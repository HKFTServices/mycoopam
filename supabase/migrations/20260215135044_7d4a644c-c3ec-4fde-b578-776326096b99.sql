
-- Add share_class_id and membership_type to member_shares
ALTER TABLE public.member_shares 
  ADD COLUMN share_class_id uuid REFERENCES public.share_classes(id),
  ADD COLUMN membership_type text NOT NULL DEFAULT 'full';

-- Create the "Join Share" share class (R1 each, no max limit)
INSERT INTO public.share_classes (tenant_id, name, price_per_share, max_per_member, is_active)
SELECT id, 'Join Share', 1.00, 0, true
FROM public.tenants
WHERE NOT EXISTS (
  SELECT 1 FROM public.share_classes WHERE name = 'Join Share' AND tenant_id = tenants.id
);

-- Update all existing member_shares to link to Join Share class and set value to R1
UPDATE public.member_shares ms
SET 
  share_class_id = sc.id,
  value = 1.00,
  membership_type = 'full'
FROM public.share_classes sc
WHERE sc.name = 'Join Share' 
  AND sc.tenant_id = ms.tenant_id;
