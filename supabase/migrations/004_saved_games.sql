-- ====================================================================
-- MIGRACIÓN 004: Partidas guardadas en la nube con dueño y PIN (vtt.saved_games)
-- AISLAMIENTO TOTAL: No modifica, renombra ni borra nada del esquema public
-- ====================================================================

-- 1. Crear tabla vtt.saved_games
create table if not exists vtt.saved_games (
  id text primary key,
  name text not null,
  owner text not null,
  pin_hash text null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Trigger para mantener updated_at automáticamente
drop trigger if exists trg_vtt_saved_games_updated_at on vtt.saved_games;
create trigger trg_vtt_saved_games_updated_at
  before update on vtt.saved_games
  for each row
  execute function vtt.set_updated_at();

-- 3. Habilitar Row Level Security (RLS) en vtt.saved_games
alter table vtt.saved_games enable row level security;

-- 4. Política RLS compartida para usuarios autenticados con la clave de la mesa
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'vtt'
      and tablename = 'saved_games'
      and policyname = 'vtt_saved_games_all_policy'
  ) then
    execute 'create policy "vtt_saved_games_all_policy" on vtt.saved_games for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- 5. Otorgar permisos a authenticated
grant select, insert, update, delete on vtt.saved_games to authenticated;
