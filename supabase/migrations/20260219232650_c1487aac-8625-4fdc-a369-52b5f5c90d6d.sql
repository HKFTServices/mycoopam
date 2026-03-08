ALTER TABLE public.admin_stock_transactions DROP CONSTRAINT admin_stock_transactions_status_check;

ALTER TABLE public.admin_stock_transactions ADD CONSTRAINT admin_stock_transactions_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'order_sent'::text,
  'invoice_received'::text,
  'stock_received'::text,
  'vault_confirmed'::text,
  'quote_sent'::text,
  'quote_accepted'::text,
  'invoice_sent'::text,
  'stock_collected'::text,
  'stock_delivered'::text,
  'approved'::text,
  'declined'::text,
  'rolled_back'::text
]));