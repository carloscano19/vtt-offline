-- ====================================================================
-- MIGRACIÓN 003: Cambiar vtt.library_assets.id de UUID a TEXT
-- Permite IDs alfanuméricos generados por la app (ej: 'asset_...')
-- ====================================================================

do $$
begin
  -- Solo modificar la columna si el tipo de datos actual no es ya text
  if exists (
    select 1 
    from information_schema.columns 
    where table_schema = 'vtt' 
      and table_name = 'library_assets' 
      and column_name = 'id' 
      and data_type != 'text'
  ) then
    alter table vtt.library_assets alter column id drop default;
    alter table vtt.library_assets alter column id type text using id::text;
  end if;
end $$;
