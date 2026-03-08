
-- Add entity_id to addresses so we can store entity-specific addresses
ALTER TABLE public.addresses ADD COLUMN entity_id UUID REFERENCES public.entities(id);

-- Make user_id nullable so entity-only addresses are possible
ALTER TABLE public.addresses ALTER COLUMN user_id DROP NOT NULL;
