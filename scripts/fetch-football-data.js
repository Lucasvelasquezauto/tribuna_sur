// Fase 2 — trae fixtures/resultados de football-data.org para los torneos
// cubiertos por esa API (Champions League, Premier League, LaLiga, Bundesliga)
// y los guarda en `partidos`. No trae canal (eso lo hace el job de IA de Fase 4).
//
// Uso: node scripts/fetch-football-data.js [YYYY-MM-DD]
// Sin fecha, usa "hoy" en America/Bogota.

import { upsert, select } from './lib/supabase.js';
import { slugify, bogotaDateStr, bogotaTimeStr } from './lib/slugify.js';

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!FOOTBALL_DATA_API_KEY) throw new Error('Falta FOOTBALL_DATA_API_KEY');

const ESTADOS = {
  SCHEDULED: 'programado',
  TIMED: 'programado',
  IN_PLAY: 'programado', // sin seguimiento en vivo minuto a minuto (ver CLAUDE.md 2.3); se cierra con el job de "cierre"
  PAUSED: 'programado',
  FINISHED: 'finalizado',
  POSTPONED: 'pospuesto',
  SUSPENDED: 'pospuesto',
  CANCELLED: 'pospuesto',
};

function targetDate() {
  const arg = process.argv[2];
  if (arg) return arg;
  return bogotaDateStr(new Date());
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`); // mediodia UTC evita cruces de dia por redondeo
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchCompetitionMatches(code, dateFrom, dateTo) {
  const url = `https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org ${code} -> ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.matches ?? [];
}

async function upsertEquipo(nombre) {
  const slug = slugify(nombre);
  const [row] = await upsert('equipos', [{ nombre, slug }], 'slug');
  return row.id;
}

async function main() {
  const fecha = targetDate();
  const dateFrom = fecha;
  const dateTo = addDaysStr(fecha, 1); // cubre el desfase UTC-5 (partido tarde UTC = mismo dia Bogota siguiente)

  const torneos = await select(
    'torneos',
    `select=id,slug,fuente_api_id_externo&fuente_api=eq.football-data`
  );

  console.log(`[fetch-football-data] fecha=${fecha} torneos=${torneos.map((t) => t.slug).join(',')}`);

  let totalPartidos = 0;

  for (const torneo of torneos) {
    const code = torneo.fuente_api_id_externo;
    let matches;
    try {
      matches = await fetchCompetitionMatches(code, dateFrom, dateTo);
    } catch (err) {
      console.error(`[${torneo.slug}] error consultando football-data.org:`, err.message);
      continue;
    }

    const matchesDelDia = matches.filter((m) => bogotaDateStr(new Date(m.utcDate)) === fecha);
    if (matchesDelDia.length === 0) {
      console.log(`[${torneo.slug}] sin partidos para ${fecha}`);
      continue;
    }

    const filas = [];
    for (const m of matchesDelDia) {
      const equipoLocalId = await upsertEquipo(m.homeTeam.name);
      const equipoVisitanteId = await upsertEquipo(m.awayTeam.name);
      await upsert(
        'equipos_torneos',
        [
          { equipo_id: equipoLocalId, torneo_id: torneo.id },
          { equipo_id: equipoVisitanteId, torneo_id: torneo.id },
        ],
        'equipo_id,torneo_id'
      );

      const utc = new Date(m.utcDate);
      const estado = ESTADOS[m.status] ?? 'programado';

      filas.push({
        torneo_id: torneo.id,
        equipo_local_id: equipoLocalId,
        equipo_visitante_id: equipoVisitanteId,
        fecha,
        hora_local: bogotaTimeStr(utc),
        estado,
        marcador_local: m.score?.fullTime?.home ?? null,
        marcador_visitante: m.score?.fullTime?.away ?? null,
        fuente: 'football-data',
        proveedor_ia: null,
      });
    }

    await upsert('partidos', filas, 'torneo_id,equipo_local_id,equipo_visitante_id,fecha');
    console.log(`[${torneo.slug}] ${filas.length} partido(s) guardado(s)`);
    totalPartidos += filas.length;
  }

  console.log(`[fetch-football-data] listo. total partidos guardados: ${totalPartidos}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
