ALTER TABLE public.transaction_fee_types DROP CONSTRAINT transaction_fee_types_based_on_check;
UPDATE public.transaction_fee_types SET based_on = 'pool_value_percentage' WHERE based_on = 'pool_values';
ALTER TABLE public.transaction_fee_types ADD CONSTRAINT transaction_fee_types_based_on_check CHECK (based_on IN ('transactions', 'pool_value_percentage', 'pool_fixed_amounts'));