
-- Add a free-form price formula column to items
-- Examples: "XAG * 1.08 + 50", "XAU * 1.05 / 20 + 50", "XAG / 31.1 * 1.08"
ALTER TABLE public.items ADD COLUMN price_formula text;

COMMENT ON COLUMN public.items.price_formula IS 'Free-form arithmetic formula using API code as variable. E.g. XAG * 1.08 + 50';
