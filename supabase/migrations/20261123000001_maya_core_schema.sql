-- maya_core_schema: core tables, indexes, and updated_at triggers.
-- Applied to project ljfydqtrbhjlijwdajpl on 2026-11-23.

create extension if not exists "pgcrypto";

create type maya_member_role as enum ('owner','tenant_admin','support','auditor','member','guest');
create type maya_device_platform as enum ('windows','macos','android','ios','web');
create type maya_command_status as enum ('pending','executed','rejected','failed','awaiting_confirmation');
create type maya_risk_level as enum ('safe','sensitive','high');
create type maya_command_channel as enum ('voice','text','remote');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'ar-EG',
  voice_output text not null default 'ar',
  language_mode text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role maya_member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  name text not null,
  platform maya_device_platform not null,
  app_version text,
  is_trusted boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wake_word text not null default 'مايا',
  voice_commands_enabled boolean not null default true,
  cloud_fallback_enabled boolean not null default false,
  data_retention_days integer not null default 30 check (data_retention_days between 1 and 365),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Transcripts are stored only with explicit consent; raw audio and voiceprint
-- templates are never stored in the database (plan section 9).
create table public.voice_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  channel maya_command_channel not null default 'voice',
  transcript text,
  intent text,
  risk maya_risk_level not null default 'safe',
  status maya_command_status not null default 'pending',
  result jsonb,
  error text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index idx_tenant_members_user on public.tenant_members(user_id);
create index idx_tenant_members_tenant on public.tenant_members(tenant_id);
create index idx_devices_user on public.devices(user_id);
create index idx_voice_commands_user_time on public.voice_commands(user_id, created_at desc);
create index idx_voice_commands_tenant_time on public.voice_commands(tenant_id, created_at desc);
create index idx_audit_logs_tenant_time on public.audit_logs(tenant_id, created_at desc);
create index idx_audit_logs_actor_time on public.audit_logs(actor_id, created_at desc);

create or replace function public.maya_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_touch before update on public.profiles for each row execute function public.maya_touch_updated_at();
create trigger trg_tenants_touch before update on public.tenants for each row execute function public.maya_touch_updated_at();
create trigger trg_devices_touch before update on public.devices for each row execute function public.maya_touch_updated_at();
create trigger trg_user_settings_touch before update on public.user_settings for each row execute function public.maya_touch_updated_at();
