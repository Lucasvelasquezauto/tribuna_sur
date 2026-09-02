-- Tribuna Sur — Escudos de equipo
-- Ejecutar en el SQL Editor de Supabase (mismo patron que 001/002).
--
-- Diseno: el escudo se busca del lado del navegador (Wikipedia/Wikidata,
-- gratis, sin key) SOLO la primera vez que alguien marca ese equipo como
-- favorito -- no un job que llene los 256 equipos de una vez, la mayoria
-- nunca se van a favoritear. El navegador usa la clave "anon" (publica,
-- solo lectura en el resto del esquema) para guardar el resultado, asi que
-- necesita una unica excepcion acotada:
--
--   1. GRANT de columna: anon solo puede hacer UPDATE de `escudo_url`,
--      ninguna otra columna de `equipos` (nombre, slug, etc. siguen
--      protegidas).
--   2. Policy RLS: ese UPDATE solo funciona si `escudo_url` esta vacio y
--      termina lleno -- en la practica, "se puede escribir una sola vez por
--      equipo". Una vez guardado, nadie puede sobreescribirlo con la clave
--      publica (solo el service_role del backend, que ignora RLS).
--
-- Ver CLAUDE.md seccion 13 para la decision completa.

alter table equipos add column if not exists escudo_url text;

grant update (escudo_url) on equipos to anon;

create policy "anon puede llenar escudo_url una sola vez" on equipos
  for update
  to anon
  using (escudo_url is null)
  with check (escudo_url is not null);
