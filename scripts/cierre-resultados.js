// Fase 5 — job de "cierre": para partidos de HOY que siguen en estado
// 'programado' y cuya hora + ~2h ya paso, vuelve a consultar la fuente que trajo
// ese torneo y actualiza el resultado. Solo hace algo si hay partidos que
// cerrar -- la mayoria de las corridas no encuentran nada (ver CLAUDE.md
// seccion 8). Pensado para correr cada hora via GitHub Actions.
//
// Uso: node scripts/cierre-resultados.js

import { select } from './lib/supabase.js';
import { bogotaDateStr, bogotaTimeStr } from './lib/slugify.js';
import { fetchFootballData } from './fetch-football-data.js';
import { fetchCanal } from './fetch-canal.js';
import { fetchIa } from './fetch-ia.js';
import { esEjecucionDirecta } from './lib/cli.js';

const MARGEN_CIERRE_MINUTOS = 120; // "~2h" de CLAUDE.md seccion 8

function minutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

export async function cerrarResultadosDeHoy() {
  const fecha = bogotaDateStr(new Date());
  const ahoraMin = minutos(bogotaTimeStr(new Date()));

  const pendientes = await select(
    'partidos',
    `select=hora_local,torneo:torneo_id(slug,fuente_tipo)&fecha=eq.${fecha}&estado=eq.programado&hora_local=not.is.null`
  );

  const torneosACerrar = new Map(); // slug -> fuente_tipo
  for (const p of pendientes) {
    if (ahoraMin - minutos(p.hora_local) >= MARGEN_CIERRE_MINUTOS) {
      torneosACerrar.set(p.torneo.slug, p.torneo.fuente_tipo);
    }
  }

  if (torneosACerrar.size === 0) {
    console.log(`[cierre] ${fecha}: nada que cerrar (${pendientes.length} partido(s) programado(s), ninguno paso el margen de ${MARGEN_CIERRE_MINUTOS}min)`);
    return;
  }

  console.log(`[cierre] ${fecha}: cerrando ${[...torneosACerrar.keys()].join(', ')}`);

  for (const [slug, fuenteTipo] of torneosACerrar) {
    try {
      if (fuenteTipo === 'api_estructurada') {
        await fetchFootballData(fecha, { soloSlugs: [slug] });
        await fetchCanal(slug, fecha);
      } else {
        await fetchIa(slug, fecha);
      }
    } catch (err) {
      console.error(`[cierre] error cerrando ${slug}:`, err.message);
    }
  }
}

if (esEjecucionDirecta(import.meta.url)) {
  cerrarResultadosDeHoy().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
