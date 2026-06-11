-- Controlled writer for access events (views, logins). SECURITY DEFINER so the
-- audit_log table stays closed to direct client INSERTs (consistent with the
-- de-exposed trigger functions). Caller can only ever log as themselves.
CREATE OR REPLACE FUNCTION public.log_access(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;  -- never log anonymous activity
  end if;

  if p_action not in ('view','login','logout') then
    raise exception 'log_access: invalid action %', p_action;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, created_at)
  values (
    v_user,
    case when p_entity_type is null then p_action
         else p_action || '.' || p_entity_type end,
    p_entity_type,
    p_entity_id,
    now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.log_access(text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_access(text, text, uuid) TO authenticated;
