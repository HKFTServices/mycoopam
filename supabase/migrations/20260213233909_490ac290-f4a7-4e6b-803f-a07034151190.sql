
-- Add control account link and default entry type to GL accounts
ALTER TABLE public.gl_accounts
ADD COLUMN control_account_id UUID REFERENCES public.control_accounts(id),
ADD COLUMN default_entry_type TEXT NOT NULL DEFAULT 'debit' CHECK (default_entry_type IN ('debit', 'credit'));
