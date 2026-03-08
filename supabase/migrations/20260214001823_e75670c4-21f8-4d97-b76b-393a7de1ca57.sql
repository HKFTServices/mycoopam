-- Allow journal entries without a GL account (custom description instead)
ALTER TABLE public.operating_journals ALTER COLUMN gl_account_id DROP NOT NULL;

-- Add a description field for journal entries that don't use a GL account
ALTER TABLE public.operating_journals ADD COLUMN description text;