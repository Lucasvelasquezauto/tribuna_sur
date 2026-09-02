// Fase 5 — job de "cierre": para partidos que siguen en estado 'programado'
// cuando ya deberian haber terminado, vuelve a consultar la fuente que trajo
// ese torneo y actualiza el resultado. Revisa HOY (con margen de ~2h sobre la
// hora del partido) y los ULTIMOS_DIAS_ATRAS dias anteriores (cualquier
// partido de un dia ya pasado que siga 'programado' esta, por definicion,
// vencido). Ver CLAUDE.md seccion 8 y 13 -- sin este respaldo, un dia en que
// el cron no corre (ej. secrets mal configurados) deja partidos pegados en
// 'programado' para siempre, porque el cierre solo miraba "hoy".
//
// Solo hace algo si hay partidos que cerrar -- la mayoria de las corridas no
// encuentran nada. Pensado para correr cada hora via GitHub Actions.
//
// Uso: node scripts/cierre-resultados.js

import { select } from './lib/supabase.js';
import { bogotaDateStr, bogotaTimeStr } from './lib/slugify.js';
import { fetchFootballData } from './fetch-football-data.js';
import { fetchCanal } from './fetch-canal.js';
import { fetchIa } from './fetch-ia.js';
import { esEjecucionDirecta } from './lib/cli.js';

const MARGEN_CIERRE_MINUTOS = 120; // "~2h" de CLAUDE.md seccion 8, solo aplica a partidos de HOY
const DIAS_ATRAS = 3; // red de seguridad si el cron no corrio uno o mas dias

function minutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function restarDias(fechaStr, dias) {
  const d = new Date(`${fechaStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

async function pendientesDelDia(fecha, esHoy, ahoraMin) {
  const pendientes = await select(
    'partidos',
    `select=hora_local,torneo:torneo_id(slug,fuente_tipo)&fecha=eq.${fecha}&estado=eq.programado&hora_local=not.is.null`
  );
  if (esHoy) {
    return pendientes.filter((p) => ahoraMin - minutos(p.hora_local) >= MARGEN_CIERRE_MINUTOS);
  }
  return pendientes; // cualquier dia ya pasado: si sigue 'programado', esta vencido
}

export async function cerrarResultadosDeHoy() {
  const hoy = bogotaDateStr(new Date());
  const ahoraMin = minutos(bogotaTimeStr(new Date()));

  // torneosACerrar: "slug:fecha" -> {slug, fecha, fuenteTipo}
  const torneosACerrar = new Map();

  for (let dias = 0; dias <= DIAS_ATRAS; dias++) {
    const fecha = dias === 0 ? hoy : restarDias(hoy, dias);
    const pendientes = await pendientesDelDia(fecha, dias === 0, ahoraMin);
    for (const p of pendientes) {
      torneosACerrar.set(`${p.torneo.slug}:${fecha}`, { slug: p.torneo.slug, fecha, fuenteTipo: p.torneo.fuente_tipo });
    }
  }

  if (torneosACerrar.size === 0) {
    console.log(`[cierre] ${hoy}: nada que cerrar (revisando hoy y los ultimos ${DIAS_ATRAS} dias)`);
    return;
  }

  console.log(`[cierre] cerrando: ${[...torneosACerrar.values()].map((t) => `${t.slug}@${t.fecha}`).join(', ')}`);

  for (const { slug, fecha, fuenteTipo } of torneosACerrar.values()) {
    try {
      if (fuenteTipo === 'api_estructurada') {
        await fetchFootballData(fecha, { soloSlugs: [slug] });
        await fetchCanal(slug, fecha);
      } else {
        await fetchIa(slug, fecha);
      }
    } catch (err) {
      console.error(`[cierre] error cerrando ${slug} (${fecha}):`, err.message);
    }
  }
}

if (esEjecucionDirecta(import.meta.url)) {
  cerrarResultadosDeHoy().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
