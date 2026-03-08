
-- Drop the duplicate that was partially created
DROP POLICY IF EXISTS "Anyone can view tax types" ON public.tax_types;
DROP POLICY IF EXISTS "Super admins can manage tax types" ON public.tax_types;

-- Create with unique names
CREATE POLICY "Anyone can view tax types"
  ON public.tax_types FOR SELECT
  USING (true);

CREATE POLICY "Super admins can manage tax types globally"
  ON public.tax_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));
