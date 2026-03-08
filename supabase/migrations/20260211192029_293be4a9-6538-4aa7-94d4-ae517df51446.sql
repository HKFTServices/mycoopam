
-- Add language_code column to communication_templates
ALTER TABLE public.communication_templates
ADD COLUMN language_code text NOT NULL DEFAULT 'en';

-- Extend the application_event enum with legacy template types
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'co_op_name';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'dear';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'debit_order';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'dep_metal_approval';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'deposit_funds_approval';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'email_footer';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'first_membership_dep_funds';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'first_membership_dep_metal';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'funds_receipt';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'stock_purchase_approval';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'switching_approval';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'termination_of_membership';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'transfer_approval';
ALTER TYPE public.application_event ADD VALUE IF NOT EXISTS 'withdrawal_approval';
