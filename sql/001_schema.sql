-- Tribuna Sur — Fase 1: esquema de base de datos
-- Ejecutar una sola vez en Supabase (SQL Editor). Ver CLAUDE.md seccion 7.

create table if not exists torneos (
  id serial primary key,
  nombre text not null,
  slug text unique not null,
  activo_por_defecto boolean default false,
  fuente_tipo text not null check (fuente_tipo in ('api_estructurada', 'ia')),
  fuente_api text,
  fuente_api_id_externo text
);

create table if not exists equipos (
  id serial primary key,
  nombre text not null,
  slug text unique not null
);

create table if not exists equipos_torneos (
  equipo_id int references equipos(id) on delete cascade,
  torneo_id int references torneos(id) on delete cascade,
  primary key (equipo_id, torneo_id)
);

create table if not exists fuentes_por_torneo (
  id serial primary key,
  torneo_id int references torneos(id) on delete cascade,
  url text not null,
  prioridad int default 1,
  activo boolean default true,
  unique (torneo_id, url)
);

create table if not exists partidos (
  id serial primary key,
  torneo_id int references torneos(id) on delete cascade,
  equipo_local_id int references equipos(id),
  equipo_visitante_id int references equipos(id),
  fecha date not null,
  hora_local time,
  estado text not null default 'programado' check (estado in ('programado', 'finalizado', 'pospuesto')),
  marcador_local int,
  marcador_visitante int,
  canal text,
  fuente text not null check (fuente in ('football-data', 'ia')),
  proveedor_ia text check (proveedor_ia in ('gemini', 'openrouter') or proveedor_ia is null),
  confianza text default 'sin_confirmar' check (confianza in ('confirmado', 'sin_confirmar')),
  actualizado_en timestamptz default now(),
  unique (torneo_id, equipo_local_id, equipo_visitante_id, fecha)
);

create table if not exists fetch_jobs (
  id serial primary key,
  torneo_id int references torneos(id) on delete cascade,
  fecha date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'listo', 'error')),
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now(),
  unique (torneo_id, fecha)
);

create table if not exists overrides_manuales (
  id serial primary key,
  partido_id int references partidos(id) on delete cascade,
  campo text not null,
  valor text not null,
  motivo text,
  creado_en timestamptz default now()
);

-- Lectura publica (clave anon, solo lectura) para las tablas que consulta el frontend.
-- Escritura queda reservada a la clave service_role (usada solo por los jobs).
alter table torneos enable row level security;
alter table equipos enable row level security;
alter table equipos_torneos enable row level security;
alter table fuentes_por_torneo enable row level security;
alter table partidos enable row level security;
alter table overrides_manuales enable row level security;
-- fetch_jobs y fuentes_por_torneo no las lee el frontend directamente, pero se deja RLS
-- consistente por si se agrega un panel de estado mas adelante.
alter table fetch_jobs enable row level security;

create policy "lectura publica torneos" on torneos for select using (true);
create policy "lectura publica equipos" on equipos for select using (true);
create policy "lectura publica equipos_torneos" on equipos_torneos for select using (true);
create policy "lectura publica partidos" on partidos for select using (true);
create policy "lectura publica overrides_manuales" on overrides_manuales for select using (true);
-- fuentes_por_torneo y fetch_jobs son detalle interno de los jobs: sin policy de select
-- publico, solo accesibles via service_role (que bypassea RLS).
