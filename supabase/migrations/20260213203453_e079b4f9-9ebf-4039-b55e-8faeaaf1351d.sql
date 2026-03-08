
-- Remove foreign key and column
ALTER TABLE public.income_expense_items DROP CONSTRAINT IF EXISTS income_expense_items_pool_id_fkey;
ALTER TABLE public.income_expense_items DROP COLUMN IF EXISTS pool_id;
