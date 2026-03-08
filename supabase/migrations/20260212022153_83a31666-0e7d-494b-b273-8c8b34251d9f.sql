
-- Tax Types table
CREATE TABLE public.tax_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  percentage numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tax types" ON public.tax_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant members can view tax types" ON public.tax_types FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_tax_types_updated_at BEFORE UPDATE ON public.tax_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Items (Instruments) table
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  pool_id uuid NOT NULL REFERENCES public.pools(id),
  item_code text NOT NULL,
  description text NOT NULL,
  margin_percentage numeric NOT NULL DEFAULT 0,
  use_fixed_price numeric DEFAULT NULL,
  calculate_price_with_item_id uuid REFERENCES public.items(id) DEFAULT NULL,
  calculation_type text DEFAULT NULL,
  calculate_price_with_factor numeric DEFAULT NULL,
  api_code text DEFAULT NULL,
  api_link text DEFAULT NULL,
  is_stock_item boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  tax_type_id uuid REFERENCES public.tax_types(id) DEFAULT NULL,
  show_item_price_on_statement boolean NOT NULL DEFAULT false,
  creator_user_id uuid DEFAULT NULL,
  last_modifier_user_id uuid DEFAULT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  deleter_user_id uuid DEFAULT NULL,
  deletion_time timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all items" ON public.items FOR ALL
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can manage tenant items" ON public.items FOR ALL
  USING (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'tenant_admin', tenant_id));

CREATE POLICY "Tenant members can view items" ON public.items FOR SELECT
  USING (is_tenant_member(auth.uid(), tenant_id) OR has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
