-- Delete today's incorrect pool prices so the next scheduled run recalculates them
DELETE FROM daily_pool_prices 
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5' 
AND totals_date = '2026-03-31';

-- Delete today's incomplete stock prices so they are also recalculated
DELETE FROM daily_stock_prices 
WHERE tenant_id = 'ad2df6f1-9ac4-43d3-ab11-9bd5a0ed48f5' 
AND price_date = '2026-03-31';