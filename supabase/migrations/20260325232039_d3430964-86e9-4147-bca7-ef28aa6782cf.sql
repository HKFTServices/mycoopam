ALTER TABLE public.income_expense_items 
ADD COLUMN gl_account_id uuid REFERENCES public.gl_accounts(id);