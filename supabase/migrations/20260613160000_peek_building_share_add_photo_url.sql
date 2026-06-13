-- peek_building_share: also return the building's photo_url (for the guest claim
-- screen hero). Applied on demo by web Claude (recorded:
-- peek_building_share_add_photo_url). Reconstructed here from the repo base
-- (20260611215440) + the photo_url addition — web Claude: confirm this matches
-- the recorded SQL byte-for-byte, or replace with the exact recorded version.

create or replace function public.peek_building_share(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'private', 'extensions'
as $function$
declare
  v record;
begin
  select s.revoked_at, s.expires_at, b.name as building_name, b.photo_url as photo_url
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
  return jsonb_build_object('status','ok','building_name',v.building_name,'expires_at',v.expires_at,'photo_url',v.photo_url);
end;
$function$;
