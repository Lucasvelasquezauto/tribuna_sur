// Fase 4 (segunda parte) — llena el campo `canal` para los torneos que ya
// tienen hora/resultado via football-data.org (Champions League, Premier
// League, LaLiga, Bundesliga). No toca hora_local/estado/marcador: esos datos
// football-data.org los da mejor. Requiere correr fetch-football-data.js antes
// para la misma fecha (si no hay partidos guardados, no hay nada que hacer).
//
// Uso: node scripts/fetch-canal.js <slug-del-torneo> [YYYY-MM-DD]
// Ej:  node scripts/fetch-canal.js champions-league

import { select, patch } from './lib/supabase.js';
import { bogotaDateStr } from './lib/slugify.js';
import { fetchAsText } from './lib/html-to-text.js';
import { extraerPartidosConGemini } from './lib/gemini.js';
import { encontrarEquipoId } from './lib/match-equipo.js';
import { esEjecucionDirecta } from './lib/cli.js';

export async function fetchCanal(torneoSlug, fecha = bogotaDateStr(new Date())) {
  const [torneo] = await select('torneos', `select=id,nombre,slug,fuente_tipo&slug=eq.${torneoSlug}`);
  if (!torneo) throw new Error(`Torneo "${torneoSlug}" no existe en la tabla torneos`);
  if (torneo.fuente_tipo !== 'api_estructurada') {
    throw new Error(`fetch-canal.js es solo para torneos api_estructurada; "${torneoSlug}" es "${torneo.fuente_tipo}" (usar fetch-ia.js)`);
  }

  const partidosExistentes = await select(
    'partidos',
    `select=id,equipo_local_id,equipo_visitante_id&torneo_id=eq.${torneo.id}&fecha=eq.${fecha}`
  );
  if (partidosExistentes.length === 0) {
    console.log(`[fetch-canal] sin partidos guardados para ${torneoSlug} en ${fecha} (correr fetch-football-data.js primero). nada que hacer.`);
    return;
  }
  console.log(`[fetch-canal] torneo=${torneoSlug} fecha=${fecha} partidos_existentes=${partidosExistentes.length}`);

  const porParDeEquipos = new Map(
    partidosExistentes.map((p) => [`${p.equipo_local_id}:${p.equipo_visitante_id}`, p])
  );

  // Candidatos para el matching por nombre: solo equipos ya conocidos EN ESTE
  // TORNEO (evita que "Real Sociedad" matchee con un equipo de otro pais).
  const idsEquiposDelTorneo = [...new Set(partidosExistentes.flatMap((p) => [p.equipo_local_id, p.equipo_visitante_id]))];
  const equiposCandidatos = await select('equipos', `select=id,nombre&id=in.(${idsEquiposDelTorneo.join(',')})`);

  const fuentes = await select(
    'fuentes_por_torneo',
    `select=url,prioridad&torneo_id=eq.${torneo.id}&activo=eq.true&order=prioridad.asc`
  );
  if (fuentes.length === 0) throw new Error(`Sin fuentes activas para ${torneoSlug} en fuentes_por_torneo`);

  let extraidos = [];
  for (const fuente of fuentes) {
    try {
      console.log(`[fetch-canal] intentando fuente (prioridad ${fuente.prioridad}): ${fuente.url}`);
      const texto = await fetchAsText(fuente.url);
      extraidos = await extraerPartidosConGemini(texto, fecha, torneo.nombre);
      console.log(`[fetch-canal] ${extraidos.length} partido(s) extraidos de esta fuente`);
      if (extraidos.length > 0) break;
    } catch (err) {
      console.error(`[fetch-canal] fuente ${fuente.url} fallo:`, err.message);
    }
  }

  let actualizados = 0;
  for (const p of extraidos) {
    if (!p.canal || !p.equipo_local || !p.equipo_visitante) continue;

    const idLocal = encontrarEquipoId(p.equipo_local, equiposCandidatos);
    const idVisitante = encontrarEquipoId(p.equipo_visitante, equiposCandidatos);
    if (!idLocal || !idVisitante) continue; // no se pudo identificar con confianza, mejor no actualizar

    const partido = porParDeEquipos.get(`${idLocal}:${idVisitante}`);
    if (!partido) continue; // el extraido no corresponde a ninguno de los partidos ya guardados

    // football-data.org ya dio hora/marcador y la IA ahora confirma el canal
    // de forma independiente para el mismo partido -- eso es exactamente la
    // "confianza confirmada" de CLAUDE.md seccion 7.
    await patch('partidos', `id=eq.${partido.id}`, { canal: p.canal, confianza: 'confirmado' });
    actualizados++;
    console.log(`[fetch-canal] canal actualizado: ${p.equipo_local} vs ${p.equipo_visitante} -> ${p.canal}`);
  }

  console.log(`[fetch-canal] listo. ${actualizados}/${partidosExistentes.length} partido(s) con canal actualizado`);
  return actualizados;
}

if (esEjecucionDirecta(import.meta.url)) {
  const torneoSlug = process.argv[2];
  if (!torneoSlug) {
    console.error('Uso: node scripts/fetch-canal.js <slug-del-torneo> [YYYY-MM-DD]');
    process.exit(1);
  }
  fetchCanal(torneoSlug, process.argv[3] || bogotaDateStr(new Date())).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
