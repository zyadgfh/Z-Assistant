-- maya_rls_policies: isolation helpers, signup/tenant triggers, and RLS policies.
-- Applied to project ljfydqtrbhjlijwdajpl on 2026-11-23.

create or replace function public.maya_tenant_role(t uuid)
returns maya_member_role
language sql stable security definer set search_path = public as
$$
  select role from public.tenant_members
  where tenant_id = t and user_id = auth.uid()
$$;

create or replace function public.maya_is_tenant_member(t uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select exists(select 1 from public.tenant_members where tenant_id = t and user_id = auth.uid())
$$;

create or replace function public.maya_is_tenant_admin(t uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select exists(select 1 from public.tenant_members where tenant_id = t and user_id = auth.uid() and role in ('owner','tenant_admin'))
$$;

-- Auto-create profile + settings rows for every new auth user.
create or replace function public.maya_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,'maya'),'@',1)))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.maya_handle_new_user();

-- The tenant creator becomes its owner automatically.
create or replace function public.maya_assign_tenant_owner()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if new.created_by is not null then
    insert into public.tenant_members (tenant_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_tenant_owner after insert on public.tenants
for each row execute function public.maya_assign_tenant_owner();

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.devices enable row level security;
alter table public.user_settings enable row level security;
alter table public.voice_commands enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_self" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "tenants_select_member" on public.tenants for select using (public.maya_is_tenant_member(id));
create policy "tenants_insert_creator" on public.tenants for insert with check (created_by = auth.uid() and auth.uid() is not null);
create policy "tenants_update_admin" on public.tenants for update using (public.maya_is_tenant_admin(id)) with check (public.maya_is_tenant_admin(id));
create policy "tenants_delete_owner" on public.tenants for delete using (
  exists(select 1 from public.tenant_members where tenant_id = id and user_id = auth.uid() and role = 'owner')
);

create policy "members_select_same_tenant" on public.tenant_members for select
  using (user_id = auth.uid() or public.maya_is_tenant_member(tenant_id));
create policy "members_admin_manage" on public.tenant_members for all
  using (public.maya_is_tenant_admin(tenant_id)) with check (public.maya_is_tenant_admin(tenant_id));

create policy "devices_select_own" on public.devices for select using (user_id = auth.uid());
create policy "devices_insert_own" on public.devices for insert with check (user_id = auth.uid());
create policy "devices_update_own" on public.devices for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "devices_delete_own" on public.devices for delete using (user_id = auth.uid());
create policy "devices_select_tenant_admin" on public.devices for select
  using (tenant_id is not null and public.maya_is_tenant_admin(tenant_id));

create policy "settings_select_self" on public.user_settings for select using (user_id = auth.uid());
create policy "settings_insert_self" on public.user_settings for insert with check (user_id = auth.uid());
create policy "settings_update_self" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "commands_select_own" on public.voice_commands for select using (user_id = auth.uid());
create policy "commands_insert_own" on public.voice_commands for insert with check (user_id = auth.uid());
create policy "commands_update_own" on public.voice_commands for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "commands_delete_own" on public.voice_commands for delete using (user_id = auth.uid());

create policy "audit_select_own" on public.audit_logs for select using (actor_id = auth.uid());
create policy "audit_select_tenant_admin" on public.audit_logs for select
  using (tenant_id is not null and public.maya_is_tenant_admin(tenant_id));
create policy "audit_insert_own" on public.audit_logs for insert with check (actor_id = auth.uid());

revoke all on public.profiles, public.tenants, public.tenant_members, public.devices,
  public.user_settings, public.voice_commands, public.audit_logs from anon;
