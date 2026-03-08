
CREATE OR REPLACE FUNCTION public.verify_transfer_recipient_id(
  p_entity_id uuid,
  p_id_number text
)
RETURNS TABLE(is_valid boolean, person_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_norm text;
  v_person_name text;
BEGIN
  v_id_norm := upper(trim(p_id_number));

  -- Find a natural person entity whose ID/passport matches,
  -- linked (via shared user) to the recipient entity account
  SELECT (e.name || COALESCE(' ' || e.last_name, ''))
  INTO v_person_name
  FROM user_entity_relationships uer_account
  JOIN user_entity_relationships uer_person ON uer_person.user_id = uer_account.user_id
  JOIN entities e ON e.id = uer_person.entity_id
  WHERE uer_account.entity_id = p_entity_id
    AND (
      (e.identity_number IS NOT NULL AND upper(e.identity_number) = v_id_norm) OR
      (e.passport_number IS NOT NULL AND upper(e.passport_number) = v_id_norm)
    )
  LIMIT 1;

  IF v_person_name IS NOT NULL THEN
    RETURN QUERY SELECT true, v_person_name;
  ELSE
    RETURN QUERY SELECT false, NULL::text;
  END IF;
END;
$$;
