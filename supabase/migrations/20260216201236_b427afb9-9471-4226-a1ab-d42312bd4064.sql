
-- Fix search_path for get_loan_outstanding
ALTER FUNCTION public.get_loan_outstanding(uuid) SET search_path = public;

-- Fix search_path for get_loan_transactions
ALTER FUNCTION public.get_loan_transactions(uuid, text) SET search_path = public;
