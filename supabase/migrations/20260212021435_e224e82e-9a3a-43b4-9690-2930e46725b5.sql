ALTER TABLE public.pools ADD COLUMN fixed_unit_price numeric NOT NULL DEFAULT 1.00;
COMMENT ON COLUMN public.pools.fixed_unit_price IS 'Fixed starting unit price for the pool, typically R1.00';