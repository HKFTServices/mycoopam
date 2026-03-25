INSERT INTO public.legacy_gl_mappings (tenant_id, transaction_type_id, transaction_type_name, entry_type_id, entry_type_name)
VALUES 
  ('38e204c4-829f-4544-ab53-b2f3f5342662', '1912', 'Deposit Funds', '2006', 'Gold Pool Deposit'),
  ('38e204c4-829f-4544-ab53-b2f3f5342662', '1912', 'Deposit Funds', '2008', 'Silver Pool Deposit')
ON CONFLICT DO NOTHING;