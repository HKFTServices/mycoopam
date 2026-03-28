CREATE UNIQUE INDEX idx_entity_accounts_unique_number_per_tenant 
ON entity_accounts (tenant_id, account_number) 
WHERE account_number IS NOT NULL;