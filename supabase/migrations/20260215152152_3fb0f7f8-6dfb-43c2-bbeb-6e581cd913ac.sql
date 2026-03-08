
-- Drop the old FK and column, add correct ones
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_entity_id_fkey;
ALTER TABLE public.stock_transactions RENAME COLUMN entity_id TO entity_account_id;
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_entity_account_id_fkey FOREIGN KEY (entity_account_id) REFERENCES public.entity_accounts(id);

ALTER TABLE public.stock_transactions RENAME COLUMN unit_price TO cost_price;
