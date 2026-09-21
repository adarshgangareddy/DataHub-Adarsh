-- Gate control schema. Run this once in the Supabase SQL editor (or with psql).
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------- devices
create table if not exists devices (
  id                       uuid primary key default gen_random_uuid(),
  device_id                text not null unique
                             check (device_id ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  name                     text not null,
  status                   text not null default 'OFFLINE'
                             check (status in ('ONLINE', 'OFFLINE')),
  gate_status              text not null default 'UNKNOWN'
                             check (gate_status in ('OPEN', 'CLOSED', 'OPENING', 'CLOSING', 'UNKNOWN')),
  mode                     text not null default 'AUTO'
                             check (mode in ('AUTO', 'MANUAL')),
  last_seen                timestamptz,
  firmware_version         text,
  -- Increases by one every time the schedule is saved.
  schedule_version         integer not null default 0,
  -- Highest schedule version the device has confirmed it is running.
  applied_schedule_version integer,
  -- Latest extra readings from the device (Wi-Fi signal, RTC health, uptime...).
  telemetry                jsonb not null default '{}'::jsonb,
  -- SHA-256 of the device's secret token (never the token itself).
  token_hash               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- --------------------------------------------------------------- schedules
create table if not exists schedules (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null references devices (device_id) on delete cascade,
  day_of_week text not null
                check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  open_time   time not null,
  close_time  time not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (device_id, day_of_week),
  check (close_time > open_time)
);

-- ---------------------------------------------------------------- commands
create table if not exists commands (
  id             uuid primary key default gen_random_uuid(),
  device_id      text not null references devices (device_id) on delete cascade,
  command        text not null check (command in ('OPEN', 'CLOSE', 'SET_SCHEDULE', 'SET_MODE')),
  -- Correlates the MQTT command with the device's acknowledgement.
  request_id     uuid not null unique,
  payload        jsonb not null default '{}'::jsonb,
  requested_by   text not null,
  status         text not null default 'PENDING'
                   check (status in ('PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED')),
  result_message text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  completed_at   timestamptz
);
create index if not exists commands_device_created_idx on commands (device_id, created_at desc);
create index if not exists commands_open_idx on commands (status) where status in ('PENDING', 'SENT');

-- ------------------------------------------------------------- device_logs
create table if not exists device_logs (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null references devices (device_id) on delete cascade,
  event_type text not null,
  message    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists device_logs_device_created_idx on device_logs (device_id, created_at desc);

-- ------------------------------------------------------------ updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists devices_set_updated_at on devices;
create trigger devices_set_updated_at before update on devices
  for each row execute function set_updated_at();

drop trigger if exists schedules_set_updated_at on schedules;
create trigger schedules_set_updated_at before update on schedules
  for each row execute function set_updated_at();

-- ------------------------------------------- atomic schedule version bump
create or replace function bump_schedule_version(p_device_id text) returns integer
language sql as $$
  update devices set schedule_version = schedule_version + 1
  where device_id = p_device_id
  returning schedule_version;
$$;

revoke execute on function bump_schedule_version(text) from public, anon, authenticated;
grant execute on function bump_schedule_version(text) to service_role;

-- ---------------------------------------------------------------- security
-- The browser never talks to Supabase; only the backend does, using the service-role key.
-- Row Level Security with no policies means the public "anon" key can read and write nothing.
alter table devices     enable row level security;
alter table schedules   enable row level security;
alter table commands    enable row level security;
alter table device_logs enable row level security;

revoke all on devices, schedules, commands, device_logs from anon, authenticated;

-- The first device is also created by the backend on startup (DEVICE_ID), so this seed is optional.
insert into devices (device_id, name) values ('GATE-001', 'Main gate')
on conflict (device_id) do nothing;
