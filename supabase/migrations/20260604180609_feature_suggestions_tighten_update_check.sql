drop policy if exists feature_suggestions_update on public.feature_suggestions;

create policy feature_suggestions_update on public.feature_suggestions
  for update to authenticated
  using (exists (select 1 from public.access_grants
                 where user_id = auth.uid() and role = 'super_admin'
                   and (expires_at is null or expires_at > now())))
  with check (exists (select 1 from public.access_grants
                 where user_id = auth.uid() and role = 'super_admin'
                   and (expires_at is null or expires_at > now())));
