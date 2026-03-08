
-- Make pool_id optional (global schedules apply to all pools)
ALTER TABLE public.pool_price_schedules ALTER COLUMN pool_id DROP NOT NULL;

-- Drop the old unique constraint and create a new one for tenant-level schedules
ALTER TABLE public.pool_price_schedules DROP CONSTRAINT pool_price_schedules_tenant_id_pool_id_update_time_key;
CREATE UNIQUE INDEX pool_price_schedules_tenant_time_unique 
  ON public.pool_price_schedules (tenant_id, update_time) 
  WHERE pool_id IS NULL;
