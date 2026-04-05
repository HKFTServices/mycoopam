
CREATE OR REPLACE FUNCTION public.notify_super_admins_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin RECORD;
  v_creator_name TEXT;
BEGIN
  -- Get creator display name
  SELECT COALESCE(first_name || ' ' || COALESCE(last_name, ''), email, 'A user')
  INTO v_creator_name
  FROM public.profiles
  WHERE user_id = NEW.created_by
  LIMIT 1;

  -- Insert a notification for every super_admin
  FOR v_admin IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
      AND ur.user_id != NEW.created_by
  LOOP
    INSERT INTO public.notifications (
      tenant_id, recipient_user_id, actor_user_id,
      category, event, title, body,
      related_table, related_id, status
    ) VALUES (
      NEW.tenant_id,
      v_admin.user_id,
      NEW.created_by,
      'support',
      'new_ticket',
      'New support ticket: ' || NEW.subject,
      v_creator_name || ' lodged a ' || NEW.category || ' ticket',
      'support_tickets',
      NEW.id,
      'unread'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_super_admins_new_ticket
AFTER INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_super_admins_new_ticket();
