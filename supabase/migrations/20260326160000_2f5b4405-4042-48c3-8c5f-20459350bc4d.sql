-- Notifications center (in-app)

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  status text,
  related_table text,
  related_id uuid,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  entity_account_id uuid REFERENCES public.entity_accounts(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications (tenant_id, recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (tenant_id, recipient_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- Mark own notifications read/unread
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Helper that inserts a notification (runs as table owner via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.insert_notification(
  _tenant_id uuid,
  _recipient_user_id uuid,
  _actor_user_id uuid,
  _category text,
  _event text,
  _title text,
  _body text,
  _status text,
  _related_table text,
  _related_id uuid,
  _entity_id uuid,
  _entity_account_id uuid,
  _meta jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    tenant_id,
    recipient_user_id,
    actor_user_id,
    category,
    event,
    title,
    body,
    status,
    related_table,
    related_id,
    entity_id,
    entity_account_id,
    meta
  ) VALUES (
    _tenant_id,
    _recipient_user_id,
    _actor_user_id,
    _category,
    _event,
    _title,
    _body,
    _status,
    _related_table,
    _related_id,
    _entity_id,
    _entity_account_id,
    COALESCE(_meta, '{}'::jsonb)
  );
END;
$$;

-- Notify on transaction insert/status change
CREATE OR REPLACE FUNCTION public.notify_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_user_id uuid;
  member_name text;
  account_number text;
  pool_name text;
  txn_type text;
  title text;
  body text;
BEGIN
  SELECT ea.account_number,
         trim(concat_ws(' ', e.name, e.last_name))
    INTO account_number, member_name
  FROM public.entity_accounts ea
  JOIN public.entities e ON e.id = ea.entity_id
  WHERE ea.id = NEW.entity_account_id;

  SELECT p.name INTO pool_name FROM public.pools p WHERE p.id = NEW.pool_id;
  SELECT tt.name INTO txn_type FROM public.transaction_types tt WHERE tt.id = NEW.transaction_type_id;

  IF TG_OP = 'INSERT' THEN
    title := 'Transaction submitted';
    body := concat_ws(' · ',
      NULLIF(member_name, ''),
      CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
      NULLIF(txn_type, ''),
      NULLIF(pool_name, ''),
      'Amount ' || NEW.amount::text
    );

    -- Notify member (submitter)
    PERFORM public.insert_notification(
      NEW.tenant_id,
      NEW.user_id,
      NEW.user_id,
      'transaction',
      'submitted',
      title,
      body,
      NEW.status,
      'transactions',
      NEW.id,
      NULL,
      NEW.entity_account_id,
      jsonb_build_object(
        'transaction_id', NEW.id,
        'status', NEW.status,
        'amount', NEW.amount,
        'pool_id', NEW.pool_id,
        'transaction_type_id', NEW.transaction_type_id
      )
    );

    -- Notify staff (tenant_admin/manager/clerk) + super_admin
    FOR staff_user_id IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE (
        ur.tenant_id = NEW.tenant_id
        AND ur.role::text IN ('tenant_admin', 'manager', 'clerk')
      ) OR ur.role::text = 'super_admin'
    LOOP
      PERFORM public.insert_notification(
        NEW.tenant_id,
        staff_user_id,
        NEW.user_id,
        'transaction',
        'requires_review',
        'Transaction requires review',
        body,
        NEW.status,
        'transactions',
        NEW.id,
        NULL,
        NEW.entity_account_id,
        jsonb_build_object(
          'transaction_id', NEW.id,
          'status', NEW.status,
          'amount', NEW.amount,
          'pool_id', NEW.pool_id,
          'transaction_type_id', NEW.transaction_type_id
        )
      );
    END LOOP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      title := 'Transaction status updated';
      body := concat_ws(' · ',
        NULLIF(member_name, ''),
        CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
        NULLIF(txn_type, ''),
        NULLIF(pool_name, ''),
        'Status ' || COALESCE(NEW.status, ''),
        'Amount ' || NEW.amount::text
      );

      -- Notify member
      PERFORM public.insert_notification(
        NEW.tenant_id,
        NEW.user_id,
        NEW.approved_by,
        'transaction',
        'status_changed',
        title,
        body,
        NEW.status,
        'transactions',
        NEW.id,
        NULL,
        NEW.entity_account_id,
        jsonb_build_object(
          'transaction_id', NEW.id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'amount', NEW.amount
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_transactions_trigger ON public.transactions;
CREATE TRIGGER notify_transactions_trigger
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_transactions();

-- Notify on debit order insert/status change
CREATE OR REPLACE FUNCTION public.notify_debit_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_user_id uuid;
  member_name text;
  account_number text;
  title text;
  body text;
  actor_id uuid;
BEGIN
  SELECT ea.account_number,
         trim(concat_ws(' ', e.name, e.last_name))
    INTO account_number, member_name
  FROM public.entity_accounts ea
  JOIN public.entities e ON e.id = ea.entity_id
  WHERE ea.id = NEW.entity_account_id;

  actor_id := COALESCE(NEW.created_by, NEW.approved_by, NEW.declined_by);

  IF TG_OP = 'INSERT' THEN
    title := 'Debit order submitted';
    body := concat_ws(' · ',
      NULLIF(member_name, ''),
      CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
      'Amount ' || NEW.monthly_amount::text,
      'Status ' || COALESCE(NEW.status, '')
    );

    -- Notify creator if available (member/admin)
    IF NEW.created_by IS NOT NULL THEN
      PERFORM public.insert_notification(
        NEW.tenant_id,
        NEW.created_by,
        NEW.created_by,
        'debit_order',
        'submitted',
        title,
        body,
        NEW.status,
        'debit_orders',
        NEW.id,
        NEW.entity_id,
        NEW.entity_account_id,
        jsonb_build_object(
          'debit_order_id', NEW.id,
          'status', NEW.status,
          'monthly_amount', NEW.monthly_amount
        )
      );
    END IF;

    -- Notify staff
    FOR staff_user_id IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE (
        ur.tenant_id = NEW.tenant_id
        AND ur.role::text IN ('tenant_admin', 'manager', 'clerk')
      ) OR ur.role::text = 'super_admin'
    LOOP
      PERFORM public.insert_notification(
        NEW.tenant_id,
        staff_user_id,
        actor_id,
        'debit_order',
        'requires_review',
        'Debit order requires review',
        body,
        NEW.status,
        'debit_orders',
        NEW.id,
        NEW.entity_id,
        NEW.entity_account_id,
        jsonb_build_object(
          'debit_order_id', NEW.id,
          'status', NEW.status,
          'monthly_amount', NEW.monthly_amount
        )
      );
    END LOOP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      title := 'Debit order status updated';
      body := concat_ws(' · ',
        NULLIF(member_name, ''),
        CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
        'Status ' || COALESCE(NEW.status, ''),
        'Amount ' || NEW.monthly_amount::text
      );

      IF NEW.created_by IS NOT NULL THEN
        PERFORM public.insert_notification(
          NEW.tenant_id,
          NEW.created_by,
          actor_id,
          'debit_order',
          'status_changed',
          title,
          body,
          NEW.status,
          'debit_orders',
          NEW.id,
          NEW.entity_id,
          NEW.entity_account_id,
          jsonb_build_object(
            'debit_order_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status,
            'monthly_amount', NEW.monthly_amount
          )
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_debit_orders_trigger ON public.debit_orders;
CREATE TRIGGER notify_debit_orders_trigger
AFTER INSERT OR UPDATE ON public.debit_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_debit_orders();

-- Notify on loan application insert/status change
CREATE OR REPLACE FUNCTION public.notify_loan_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_user_id uuid;
  member_name text;
  account_number text;
  title text;
  body text;
BEGIN
  SELECT ea.account_number,
         trim(concat_ws(' ', e.name, e.last_name))
    INTO account_number, member_name
  FROM public.entity_accounts ea
  JOIN public.entities e ON e.id = ea.entity_id
  WHERE ea.id = NEW.entity_account_id;

  IF TG_OP = 'INSERT' THEN
    title := 'Loan application submitted';
    body := concat_ws(' · ',
      NULLIF(member_name, ''),
      CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
      'Amount ' || NEW.amount_requested::text,
      'Status ' || COALESCE(NEW.status, '')
    );

    -- Notify member
    PERFORM public.insert_notification(
      NEW.tenant_id,
      NEW.applicant_user_id,
      NEW.applicant_user_id,
      'loan_application',
      'submitted',
      title,
      body,
      NEW.status,
      'loan_applications',
      NEW.id,
      NEW.entity_id,
      NEW.entity_account_id,
      jsonb_build_object(
        'loan_application_id', NEW.id,
        'status', NEW.status,
        'amount_requested', NEW.amount_requested
      )
    );

    -- Notify staff
    FOR staff_user_id IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE (
        ur.tenant_id = NEW.tenant_id
        AND ur.role::text IN ('tenant_admin', 'manager', 'clerk')
      ) OR ur.role::text = 'super_admin'
    LOOP
      PERFORM public.insert_notification(
        NEW.tenant_id,
        staff_user_id,
        NEW.applicant_user_id,
        'loan_application',
        'requires_review',
        'Loan application requires review',
        body,
        NEW.status,
        'loan_applications',
        NEW.id,
        NEW.entity_id,
        NEW.entity_account_id,
        jsonb_build_object(
          'loan_application_id', NEW.id,
          'status', NEW.status,
          'amount_requested', NEW.amount_requested
        )
      );
    END LOOP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      title := 'Loan application status updated';
      body := concat_ws(' · ',
        NULLIF(member_name, ''),
        CASE WHEN account_number IS NOT NULL AND account_number <> '' THEN 'Acc ' || account_number ELSE NULL END,
        'Status ' || COALESCE(NEW.status, ''),
        'Amount ' || NEW.amount_requested::text
      );

      PERFORM public.insert_notification(
        NEW.tenant_id,
        NEW.applicant_user_id,
        NEW.reviewed_by,
        'loan_application',
        'status_changed',
        title,
        body,
        NEW.status,
        'loan_applications',
        NEW.id,
        NEW.entity_id,
        NEW.entity_account_id,
        jsonb_build_object(
          'loan_application_id', NEW.id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'amount_requested', NEW.amount_requested
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_loan_applications_trigger ON public.loan_applications;
CREATE TRIGGER notify_loan_applications_trigger
AFTER INSERT OR UPDATE ON public.loan_applications
FOR EACH ROW EXECUTE FUNCTION public.notify_loan_applications();

