-- Tribuna Sur — Fase 1: datos semilla de torneos y fuentes
-- Ejecutar despues de 001_schema.sql. Idempotente (upsert por slug/url).

insert into torneos (nombre, slug, activo_por_defecto, fuente_tipo, fuente_api, fuente_api_id_externo) values
  ('Liga Betplay',        'liga-betplay',        true,  'ia',               null,             null),
  ('Copa Betplay',        'copa-betplay',         true,  'ia',               null,             null),
  ('Champions League',    'champions-league',     true,  'api_estructurada', 'football-data',  'CL'),
  ('Torneo Betplay',      'torneo-betplay',       false, 'ia',               null,             null),
  ('UEFA Europa League',  'europa-league',        false, 'ia',               null,             null),
  ('Bundesliga',          'bundesliga',           false, 'api_estructurada', 'football-data',  'BL1'),
  ('Premier League',      'premier-league',       false, 'api_estructurada', 'football-data',  'PL'),
  ('LaLiga',              'laliga',               false, 'api_estructurada', 'football-data',  'PD'),
  ('Copa Libertadores',   'copa-libertadores',    false, 'ia',               null,             null),
  ('Copa Sudamericana',   'copa-sudamericana',    false, 'ia',               null,             null)
on conflict (slug) do update set
  nombre = excluded.nombre,
  activo_por_defecto = excluded.activo_por_defecto,
  fuente_tipo = excluded.fuente_tipo,
  fuente_api = excluded.fuente_api,
  fuente_api_id_externo = excluded.fuente_api_id_externo;

-- Fuente universal: HTML estatico, actualizado a diario, agrupado por fecha y
-- competencia, con canal/plataforma de streaming en Colombia por partido.
-- Confirmada por fetch directo (sin JS) el 2026-09-01. Ver CLAUDE.md seccion 13.
insert into fuentes_por_torneo (torneo_id, url, prioridad, activo)
select id, 'https://www.colombia.com/futbol/partidos-hoy/', 1, true
from torneos
where slug in (
  'liga-betplay', 'copa-betplay', 'torneo-betplay',
  'champions-league', 'europa-league', 'bundesliga', 'premier-league', 'laliga',
  'copa-libertadores', 'copa-sudamericana'
)
on conflict do nothing;

-- Respaldos especializados por si colombia.com no cubre un partido puntual
-- (ej. Torneo Betplay, segunda division, con menos cobertura en prensa general).
insert into fuentes_por_torneo (torneo_id, url, prioridad, activo)
select id, 'https://dimayor.com.co/category/programacion/', 2, true
from torneos where slug in ('liga-betplay', 'copa-betplay', 'torneo-betplay')
on conflict do nothing;

insert into fuentes_por_torneo (torneo_id, url, prioridad, activo)
select id, 'https://www.espn.com/soccer/schedule/_/league/conmebol.libertadores', 2, true
from torneos where slug = 'copa-libertadores'
on conflict do nothing;

insert into fuentes_por_torneo (torneo_id, url, prioridad, activo)
select id, 'https://www.espn.com/soccer/schedule/_/league/conmebol.sudamericana', 2, true
from torneos where slug = 'copa-sudamericana'
on conflict do nothing;

insert into fuentes_por_torneo (torneo_id, url, prioridad, activo)
select id, 'https://www.espn.com/soccer/schedule/_/league/uefa.europa', 2, true
from torneos where slug = 'europa-league'
on conflict do nothing;
