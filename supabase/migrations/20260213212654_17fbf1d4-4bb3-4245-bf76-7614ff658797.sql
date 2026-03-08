
ALTER TABLE public.transaction_fee_types
ADD COLUMN credit_control_account_id uuid REFERENCES public.control_accounts(id);
