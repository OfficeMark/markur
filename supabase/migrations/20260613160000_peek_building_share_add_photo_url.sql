CREATE OR REPLACE FUNCTION public.peek_building_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  v record;
begin
  select s.revoked_at, s.expires_at, b.name as building_name, b.photo_url
  into v
  from public.building_shares s
  join public.buildings b on b.id = s.building_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if not found then
    return jsonb_build_object('status','invalid');
  end if;
  if v.revoked_at is not null then
    return jsonb_build_object('status','revoked');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('status','expired');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'building_name', v.building_name,
    'expires_at', v.expires_at,
    'photo_url', v.photo_url
  );
end;
$function$;
