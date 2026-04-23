-- Update notification trigger: notify tenant admins for new tickets (not super admins)
CREATE OR REPLACE FUNCTION public.notify_super_admins_new_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Notify all tenant_admins of the ticket's tenant (first level of support)
  FOR v_admin IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'tenant_admin'
      AND ur.tenant_id = NEW.tenant_id
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
$function$;

-- New function: escalate unresolved tickets to super admins (older than 3 days, still open)
CREATE OR REPLACE FUNCTION public.escalate_stale_support_tickets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket RECORD;
  v_admin RECORD;
  v_creator_name TEXT;
BEGIN
  FOR v_ticket IN
    SELECT t.*
    FROM public.support_tickets t
    WHERE t.status IN ('open', 'in_progress')
      AND t.created_at < (now() - interval '3 days')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_table = 'support_tickets'
          AND n.related_id = t.id
          AND n.event = 'ticket_escalated'
      )
  LOOP
    SELECT COALESCE(first_name || ' ' || COALESCE(last_name, ''), email, 'A user')
    INTO v_creator_name
    FROM public.profiles
    WHERE user_id = v_ticket.created_by
    LIMIT 1;

    FOR v_admin IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role = 'super_admin'
        AND ur.user_id != v_ticket.created_by
    LOOP
      INSERT INTO public.notifications (
        tenant_id, recipient_user_id, actor_user_id,
        category, event, title, body,
        related_table, related_id, status
      ) VALUES (
        v_ticket.tenant_id,
        v_admin.user_id,
        v_ticket.created_by,
        'support',
        'ticket_escalated',
        'Escalated ticket: ' || v_ticket.subject,
        'Unresolved for 3+ days. Lodged by ' || COALESCE(v_creator_name, 'a user'),
        'support_tickets',
        v_ticket.id,
        'unread'
      );
    END LOOP;
  END LOOP;
END;
$function$;