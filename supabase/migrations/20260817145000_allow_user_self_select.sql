create policy user_account_self_select on public.user_account
  for select
  to authenticated
  using (auth_user_id = auth.uid());
