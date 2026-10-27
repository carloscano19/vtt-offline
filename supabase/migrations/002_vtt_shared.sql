-- ====================================================================
-- MIGRACIÓN 002: Partida compartida en la nube, biblioteca y almacenamiento
-- ====================================================================

-- 1. Tabla para la partida compartida en la nube (vtt.games)
create table if not exists vtt.games (
  id text primary key default 'default',
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Aventura Principal',
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para updated_at en vtt.games
drop trigger if exists trg_vtt_games_updated_at on vtt.games;
create trigger trg_vtt_games_updated_at
  before update on vtt.games
  for each row
  execute function vtt.set_updated_at();

-- Habilitar RLS en vtt.games
alter table vtt.games enable row level security;

-- Políticas RLS para vtt.games (usuarios autenticados acceden a la partida compartida)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'vtt' and tablename = 'games' and policyname = 'vtt_games_all_policy'
  ) then
    execute 'create policy "vtt_games_all_policy" on vtt.games for all to authenticated using (true) with check (true)';
  end if;
end $$;

grant select, insert, update, delete on vtt.games to authenticated;

-- 2. Asegurar que vtt.library_assets soporte 'map' y políticas compartidas
alter table vtt.library_assets drop constraint if exists library_assets_type_check;
alter table vtt.library_assets add constraint library_assets_type_check 
  check (type in ('token', 'object', 'effect', 'audio', 'image', 'gif', 'video', 'map'));

-- Política para que cualquier cliente autenticado con la clave pueda leer y gestionar assets compartidos
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'vtt' and tablename = 'library_assets' and policyname = 'vtt_assets_shared_policy'
  ) then
    execute 'create policy "vtt_assets_shared_policy" on vtt.library_assets for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- 3. Bucket de almacenamiento vtt-assets y políticas de lectura/escritura compartida
insert into storage.buckets (id, name, public)
values ('vtt-assets', 'vtt-assets', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vtt_storage_shared_policy'
  ) then
    execute 'create policy "vtt_storage_shared_policy" on storage.objects for all to authenticated using (bucket_id = ''vtt-assets'') with check (bucket_id = ''vtt-assets'')';
  end if;
end $$;

-- 4. Función RPC para obtener el uso total de almacenamiento en bytes
create or replace function vtt.get_storage_usage()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(size), 0)::bigint from vtt.library_assets;
$$;

grant execute on function vtt.get_storage_usage() to authenticated;
