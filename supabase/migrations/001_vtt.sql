-- ====================================================================
-- MIGRACIÓN VTT: Esquema vtt, Tabla library_assets, Bucket vtt-assets y Ping
-- AISLAMIENTO TOTAL: No modifica, renombra ni borra nada del esquema public
-- ====================================================================

-- 1. Crear esquema vtt si no existe
create schema if not exists vtt;

-- Otorgar uso del esquema a los roles anon y authenticated
grant usage on schema vtt to anon, authenticated;

-- 2. Función y Trigger para mantener updated_at automáticamente
create or replace function vtt.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. Tabla para metadatos de elementos reutilizables de la biblioteca
create table if not exists vtt.library_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('token', 'object', 'effect', 'audio', 'image', 'gif', 'video')),
  mime_type text not null,
  size bigint not null default 0,
  tags text[] default '{}',
  storage_path text not null,
  chroma_key jsonb default null,
  width integer default null,
  height integer default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para updated_at en vtt.library_assets
drop trigger if exists trg_vtt_library_assets_updated_at on vtt.library_assets;
create trigger trg_vtt_library_assets_updated_at
  before update on vtt.library_assets
  for each row
  execute function vtt.set_updated_at();

-- Habilitar Row Level Security (RLS) en la tabla
alter table vtt.library_assets enable row level security;

-- 4. Políticas RLS idempotentes para vtt.library_assets (comprueban pg_policies antes de crear)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'vtt'
      and tablename = 'library_assets'
      and policyname = 'vtt_assets_select_policy'
  ) then
    execute 'create policy "vtt_assets_select_policy" on vtt.library_assets for select to authenticated using (auth.uid() = user_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'vtt'
      and tablename = 'library_assets'
      and policyname = 'vtt_assets_insert_policy'
  ) then
    execute 'create policy "vtt_assets_insert_policy" on vtt.library_assets for insert to authenticated with check (auth.uid() = user_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'vtt'
      and tablename = 'library_assets'
      and policyname = 'vtt_assets_update_policy'
  ) then
    execute 'create policy "vtt_assets_update_policy" on vtt.library_assets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'vtt'
      and tablename = 'library_assets'
      and policyname = 'vtt_assets_delete_policy'
  ) then
    execute 'create policy "vtt_assets_delete_policy" on vtt.library_assets for delete to authenticated using (auth.uid() = user_id)';
  end if;
end $$;

-- Permisos sobre la tabla para authenticated
grant select, insert, update, delete on vtt.library_assets to authenticated;

-- 5. Bucket de almacenamiento privado vtt-assets
insert into storage.buckets (id, name, public)
values ('vtt-assets', 'vtt-assets', false)
on conflict (id) do nothing;

-- Políticas de Storage idempotentes para vtt-assets (carpeta con user_id)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vtt_storage_select_policy'
  ) then
    execute 'create policy "vtt_storage_select_policy" on storage.objects for select to authenticated using (bucket_id = ''vtt-assets'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vtt_storage_insert_policy'
  ) then
    execute 'create policy "vtt_storage_insert_policy" on storage.objects for insert to authenticated with check (bucket_id = ''vtt-assets'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vtt_storage_update_policy'
  ) then
    execute 'create policy "vtt_storage_update_policy" on storage.objects for update to authenticated using (bucket_id = ''vtt-assets'' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = ''vtt-assets'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vtt_storage_delete_policy'
  ) then
    execute 'create policy "vtt_storage_delete_policy" on storage.objects for delete to authenticated using (bucket_id = ''vtt-assets'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;

-- 6. Función vtt.ping() para mantenimiento y evitar pausa del proyecto
create or replace function vtt.ping()
returns integer
language sql
security definer
set search_path = ''
as $$
  select 1;
$$;

-- Permitir ejecución anónima para el cron diario de GitHub Actions
grant execute on function vtt.ping() to anon, authenticated;

-- ====================================================================
-- SQL DE COMPROBACIÓN POST-EJECUCIÓN
-- Puedes ejecutar estas consultas en el SQL Editor para verificar que todo se creó correctamente:
--
-- 1. Verificar esquema:
--    select schema_name from information_schema.schemata where schema_name = 'vtt';
--
-- 2. Verificar tabla y RLS:
--    select relname, relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where nspname = 'vtt' and relname = 'library_assets';
--
-- 3. Verificar políticas de la tabla vtt.library_assets:
--    select policyname, cmd from pg_policies where schemaname = 'vtt' and tablename = 'library_assets';
--
-- 4. Verificar bucket de storage:
--    select id, name, public from storage.buckets where id = 'vtt-assets';
--
-- 5. Verificar políticas del bucket vtt-assets:
--    select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vtt_storage_%';
--
-- 6. Probar función vtt.ping():
--    select vtt.ping(); -- Debe devolver 1
-- ====================================================================
