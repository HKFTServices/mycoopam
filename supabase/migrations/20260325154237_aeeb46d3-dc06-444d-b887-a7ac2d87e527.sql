UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Member Fees (Pool Deposit)',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1924' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Asset Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1927' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Reserve Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1928' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Health Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1929' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Health Reserve Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1930' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Member Account Pool Deposit',
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1986' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Funeral Fund Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1989' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Crypto Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '1994' 
  AND transaction_type_id = '1912';

UPDATE public.legacy_gl_mappings 
SET entry_type_name = 'Gold Pool Deposit',
    gl_account_id = NULL,
    notes = 'Pool cash control allocation — use CashAccountID to resolve pool'
WHERE entry_type_id = '2006' 
  AND transaction_type_id = '1912';