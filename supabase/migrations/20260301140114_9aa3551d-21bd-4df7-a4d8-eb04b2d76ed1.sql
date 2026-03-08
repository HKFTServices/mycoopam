-- Add new enum value for generic transaction confirmation
ALTER TYPE application_event ADD VALUE IF NOT EXISTS 'transaction_confirmation';
