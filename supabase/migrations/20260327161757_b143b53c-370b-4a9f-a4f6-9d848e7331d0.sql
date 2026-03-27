-- Add new columns for simplified transaction rules
ALTER TABLE pool_transaction_rules
  ADD COLUMN IF NOT EXISTS transaction_type_code text,
  ADD COLUMN IF NOT EXISTS is_allowed boolean NOT NULL DEFAULT true;

-- Drop the old unique constraint if it exists
ALTER TABLE pool_transaction_rules
  DROP CONSTRAINT IF EXISTS pool_transaction_rules_pool_id_transaction_type_id_key;

-- Drop the FK to transaction_types since we now use a fixed code list
ALTER TABLE pool_transaction_rules
  DROP CONSTRAINT IF EXISTS pool_transaction_rules_transaction_type_id_fkey;

-- Clear old data (it referenced transaction_type_id which is no longer used)
DELETE FROM pool_transaction_rules;

-- Drop old columns
ALTER TABLE pool_transaction_rules
  DROP COLUMN IF EXISTS transaction_type_id,
  DROP COLUMN IF EXISTS allow_to,
  DROP COLUMN IF EXISTS allow_from;

-- Add unique constraint on pool + code
ALTER TABLE pool_transaction_rules
  ADD CONSTRAINT pool_transaction_rules_pool_code_unique UNIQUE (pool_id, transaction_type_code);