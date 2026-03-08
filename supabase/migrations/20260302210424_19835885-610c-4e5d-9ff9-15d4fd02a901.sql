-- Add entity_id column to membership_applications to link each application to a specific entity
ALTER TABLE public.membership_applications
ADD COLUMN entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_membership_applications_entity_id ON public.membership_applications(entity_id);
