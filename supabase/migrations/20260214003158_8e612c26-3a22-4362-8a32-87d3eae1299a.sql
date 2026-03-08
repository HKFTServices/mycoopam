-- Add VAT tracking columns to operating_journals
ALTER TABLE public.operating_journals ADD COLUMN tax_type_id uuid REFERENCES public.tax_types(id);
ALTER TABLE public.operating_journals ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0;