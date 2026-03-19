
ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS invoice_html TEXT;
ALTER TABLE public.tenant_invoices ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE public.tenant_invoices ALTER COLUMN due_date SET DEFAULT (CURRENT_DATE + INTERVAL '30 days')::date;
