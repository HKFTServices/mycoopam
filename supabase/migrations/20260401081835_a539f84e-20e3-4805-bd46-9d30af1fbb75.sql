-- Allow managers and clerks to perform approval operations

-- 1. transactions
CREATE POLICY "Managers can view tenant transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Managers can update tenant transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can view tenant transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

CREATE POLICY "Clerks can update tenant transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 2. cashflow_transactions
CREATE POLICY "Managers can manage tenant cashflow_transactions"
  ON public.cashflow_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant cashflow_transactions"
  ON public.cashflow_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 3. unit_transactions
CREATE POLICY "Managers can manage tenant unit_transactions"
  ON public.unit_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant unit_transactions"
  ON public.unit_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 4. member_shares
CREATE POLICY "Managers can manage tenant member_shares"
  ON public.member_shares FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant member_shares"
  ON public.member_shares FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 5. commissions
CREATE POLICY "Managers can manage tenant commissions"
  ON public.commissions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant commissions"
  ON public.commissions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 6. stock_transactions
CREATE POLICY "Managers can manage tenant stock_transactions"
  ON public.stock_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant stock_transactions"
  ON public.stock_transactions FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 7. member_pool_holdings
CREATE POLICY "Managers can manage tenant holdings"
  ON public.member_pool_holdings FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can manage tenant holdings"
  ON public.member_pool_holdings FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

-- 8. entity_accounts — UPDATE + SELECT for managers/clerks
CREATE POLICY "Managers can update tenant entity_accounts"
  ON public.entity_accounts FOR UPDATE TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can update tenant entity_accounts"
  ON public.entity_accounts FOR UPDATE TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id))
  WITH CHECK (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));

CREATE POLICY "Managers can view tenant entity_accounts"
  ON public.entity_accounts FOR SELECT TO authenticated
  USING (has_tenant_role(auth.uid(), 'manager'::app_role, tenant_id));

CREATE POLICY "Clerks can view tenant entity_accounts"
  ON public.entity_accounts FOR SELECT TO authenticated
  USING (has_tenant_role(auth.uid(), 'clerk'::app_role, tenant_id));