// Puebla `equipos` + `equipos_torneos` con el roster de los 6 torneos sin API
// estructurada, leyendo el articulo de Wikipedia de la temporada actual
// (scripts/lib/roster-sources.js) via IA. Mismo motivo que
// fetch-equipos-liga.js (los 4 torneos con API): sin esto, un equipo solo
// aparece en el buscador de favoritos despues de jugar un partido que la app
// ya proceso -- bug reportado por el usuario el 2026-09-02, ver CLAUDE.md
// seccion 13. No hace falta correrlo a diario; los planteles/clasificados
// cambian poco durante la temporada.
//
// Uso: node scripts/fetch-equipos-ia.js [slug-del-torneo]
// Sin argumento, corre para los 6 torneos sin API estructurada.

import { upsert, select } from './lib/supabase.js';
import { slugify } from './lib/slugify.js';
import { fetchAsText } from './lib/html-to-text.js';
import { extraerEquiposConGemini } from './lib/roster-extraccion.js';
import { encontrarEquipoId } from './lib/match-equipo.js';
import { FUENTE_ROSTER } from './lib/roster-sources.js';
import { esEjecucionDirecta } from './lib/cli.js';

export async function fetchEquiposIa(soloSlug) {
  let torneos = await select('torneos', "select=id,slug,nombre&fuente_tipo=eq.ia");
  if (soloSlug) torneos = torneos.filter((t) => t.slug === soloSlug);

  let total = 0;
  for (const torneo of torneos) {
    const url = FUENTE_ROSTER[torneo.slug];
    if (!url) {
      console.warn(`[fetch-equipos-ia] ${torneo.slug}: sin fuente de roster registrada, se salta`);
      continue;
    }

    let nombres;
    try {
      const texto = await fetchAsText(url);
      nombres = await extraerEquiposConGemini(texto, torneo.nombre);
    } catch (err) {
      console.error(`[fetch-equipos-ia] ${torneo.slug} fallo:`, err.message);
      continue;
    }
    console.log(`[fetch-equipos-ia] ${torneo.slug}: ${nombres.length} equipo(s) extraidos de ${url}`);

    const candidatos = (
      await select('equipos_torneos', `select=equipo:equipo_id(id,nombre)&torneo_id=eq.${torneo.id}`)
    ).map((c) => c.equipo);

    for (const nombre of nombres) {
      const slug = slugify(nombre);
      const [exacto] = await select('equipos', `select=id&slug=eq.${slug}`);
      const equipoId = exacto ? exacto.id : encontrarEquipoId(nombre, candidatos);
      const idFinal = equipoId ?? (await upsert('equipos', [{ nombre, slug }], 'slug'))[0].id;

      await upsert('equipos_torneos', [{ equipo_id: idFinal, torneo_id: torneo.id }], 'equipo_id,torneo_id');
      candidatos.push({ id: idFinal, nombre });
      total++;
    }
  }
  console.log(`[fetch-equipos-ia] listo. ${total} vinculo(s) equipo-torneo procesados`);
  return total;
}

if (esEjecucionDirecta(import.meta.url)) {
  fetchEquiposIa(process.argv[2]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
