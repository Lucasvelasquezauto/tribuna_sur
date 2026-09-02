// Puebla `equipos` + `equipos_torneos` con el roster completo de los 4
// torneos api_estructurada, via el endpoint de equipos de football-data.org
// (gratis, mismo API que ya usamos para fixtures). Asi el buscador de
// favoritos del frontend encuentra un equipo aunque todavia no haya jugado
// ningun partido que la app haya procesado (bug reportado por el usuario el
// 2026-09-02, ver CLAUDE.md seccion 13). No requiere correr a diario -- los
// planteles cambian poco durante la temporada; pensado para correr una vez y
// despues de forma esporadica (ej. mensual, o al abrir mercado de fichajes).
//
// Uso: node scripts/fetch-equipos-liga.js [slug-del-torneo]
// Sin argumento, corre para los 4 torneos api_estructurada.

import { upsert, select } from './lib/supabase.js';
import { slugify } from './lib/slugify.js';
import { esEjecucionDirecta } from './lib/cli.js';

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!FOOTBALL_DATA_API_KEY) throw new Error('Falta FOOTBALL_DATA_API_KEY');

async function fetchEquiposDeCompetencia(code) {
  const res = await fetch(`https://api.football-data.org/v4/competitions/${code}/teams`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) throw new Error(`football-data.org ${code} -> ${res.status}`);
  const data = await res.json();
  return data.teams ?? [];
}

export async function fetchEquiposLiga(soloSlug) {
  let torneos = await select(
    'torneos',
    'select=id,slug,nombre,fuente_api_id_externo&fuente_api=eq.football-data'
  );
  if (soloSlug) torneos = torneos.filter((t) => t.slug === soloSlug);

  let total = 0;
  for (const torneo of torneos) {
    const equiposApi = await fetchEquiposDeCompetencia(torneo.fuente_api_id_externo);
    console.log(`[fetch-equipos-liga] ${torneo.slug}: ${equiposApi.length} equipo(s) en football-data.org`);

    for (const e of equiposApi) {
      const [equipo] = await upsert('equipos', [{ nombre: e.name, slug: slugify(e.name) }], 'slug');
      await upsert('equipos_torneos', [{ equipo_id: equipo.id, torneo_id: torneo.id }], 'equipo_id,torneo_id');
      total++;
    }
  }
  console.log(`[fetch-equipos-liga] listo. ${total} vinculo(s) equipo-torneo procesados`);
  return total;
}

if (esEjecucionDirecta(import.meta.url)) {
  fetchEquiposLiga(process.argv[2]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
