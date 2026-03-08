
-- Add legacy-matching columns to income_expense_items
ALTER TABLE public.income_expense_items ADD COLUMN vat text;
ALTER TABLE public.income_expense_items ADD COLUMN bankflow text;
ALTER TABLE public.income_expense_items ADD COLUMN extra1 text;
