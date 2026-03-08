
-- Rename existing control_account_id to debit_control_account_id and add credit_control_account_id
ALTER TABLE public.operating_journals 
  RENAME COLUMN control_account_id TO debit_control_account_id;

ALTER TABLE public.operating_journals
  ADD COLUMN credit_control_account_id UUID REFERENCES public.control_accounts(id);

-- Drop the entry_type column since we now have explicit debit/credit accounts
ALTER TABLE public.operating_journals
  DROP COLUMN entry_type;
