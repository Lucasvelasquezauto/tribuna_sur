// Fase 3/4 — extraccion via IA de partidos para los torneos sin API estructurada.
// Flujo: descargar HTML de la fuente registrada -> limpiar a texto -> pedirle a un
// LLM que devuelva JSON con el esquema fijo -> guardar en `partidos`.
// Ver CLAUDE.md seccion 6.
//
// Uso: node scripts/fetch-ia.js <slug-del-torneo> [YYYY-MM-DD]
// Ej:  node scripts/fetch-ia.js liga-betplay

import { upsert, select } from './lib/supabase.js';
import { slugify, bogotaDateStr } from './lib/slugify.js';
import { fetchAsText } from './lib/html-to-text.js';
import { extraerPartidosConGemini } from './lib/gemini.js';
import { extraerPartidosConOpenRouter } from './lib/openrouter.js';
import { buscarPostsDimayor } from './lib/dimayor-discovery.js';
import { esEjecucionDirecta } from './lib/cli.js';
import { nombresParaPrompt } from './lib/torneo-aliases.js';

// dimayor.com.co/category/programacion/ es un indice, no trae el detalle de los
// partidos -- se resuelve via la API de busqueda de WordPress a varios posts
// candidatos, y se prueban en orden de mas reciente a mas antiguo.
const ES_INDICE_DIMAYOR = (url) => url.includes('dimayor.com.co/category/programacion');

/** Para una fuente registrada, devuelve la lista de URLs candidatas a intentar en orden. */
async function candidatosParaFuente(fuente, torneoNombre) {
  if (!ES_INDICE_DIMAYOR(fuente.url)) return [fuente.url];
  const posts = await buscarPostsDimayor(torneoNombre);
  if (posts.length === 0) console.log('[fetch-ia] busqueda en dimayor.com.co sin resultados para este torneo');
  return posts.map((p) => p.url);
}

// Asignacion de proveedor por grupo de torneos (CLAUDE.md seccion 6).
const PROVEEDOR_POR_TORNEO = {
  'liga-betplay': 'gemini',
  'copa-betplay': 'gemini',
  'torneo-betplay': 'gemini',
  'copa-libertadores': 'openrouter',
  'copa-sudamericana': 'openrouter',
  'europa-league': 'openrouter',
};

const ESTADOS_VALIDOS = new Set(['programado', 'finalizado', 'pospuesto']);

async function upsertEquipo(nombre) {
  const slug = slugify(nombre);
  const [row] = await upsert('equipos', [{ nombre, slug }], 'slug');
  return row.id;
}

async function marcarFetchJob(torneoId, fecha, estado) {
  await upsert(
    'fetch_jobs',
    [{ torneo_id: torneoId, fecha, estado, actualizado_en: new Date().toISOString() }],
    'torneo_id,fecha'
  );
}

export async function fetchIa(torneoSlug, fecha = bogotaDateStr(new Date())) {
  const proveedor = PROVEEDOR_POR_TORNEO[torneoSlug];
  if (!proveedor) {
    throw new Error(
      `Torneo "${torneoSlug}" no esta en PROVEEDOR_POR_TORNEO. Torneos soportados: ${Object.keys(PROVEEDOR_POR_TORNEO).join(', ')}`
    );
  }
  const extraer = proveedor === 'gemini' ? extraerPartidosConGemini : extraerPartidosConOpenRouter;

  const [torneo] = await select('torneos', `select=id,nombre,slug&slug=eq.${torneoSlug}`);
  if (!torneo) throw new Error(`Torneo "${torneoSlug}" no existe en la tabla torneos`);

  const fuentes = await select(
    'fuentes_por_torneo',
    `select=url,prioridad&torneo_id=eq.${torneo.id}&activo=eq.true&order=prioridad.asc`
  );
  if (fuentes.length === 0) throw new Error(`Sin fuentes activas para ${torneoSlug} en fuentes_por_torneo`);

  console.log(`[fetch-ia] torneo=${torneoSlug} fecha=${fecha} proveedor=${proveedor} fuentes=${fuentes.length}`);
  await marcarFetchJob(torneo.id, fecha, 'en_curso');

  let partidosExtraidos = [];
  let ultimoError = null;

  fuentesLoop: for (const fuente of fuentes) {
    console.log(`[fetch-ia] intentando fuente (prioridad ${fuente.prioridad}): ${fuente.url}`);
    let candidatos;
    try {
      candidatos = await candidatosParaFuente(fuente, torneo.nombre);
    } catch (err) {
      ultimoError = err;
      console.error(`[fetch-ia] no se pudo resolver candidatos para ${fuente.url}:`, err.message);
      continue;
    }

    for (const url of candidatos) {
      try {
        if (url !== fuente.url) console.log(`[fetch-ia]   probando candidato: ${url}`);
        const texto = await fetchAsText(url);
        partidosExtraidos = await extraer(texto, fecha, nombresParaPrompt(torneoSlug, torneo.nombre));
        console.log(`[fetch-ia]   ${partidosExtraidos.length} partido(s) extraidos`);
        if (partidosExtraidos.length > 0) break fuentesLoop; // encontro datos, no hace falta seguir probando
      } catch (err) {
        ultimoError = err;
        console.error(`[fetch-ia]   ${url} fallo:`, err.message);
      }
    }
  }

  if (partidosExtraidos.length === 0) {
    await marcarFetchJob(torneo.id, fecha, ultimoError ? 'error' : 'listo');
    console.log(`[fetch-ia] sin partidos para ${torneoSlug} en ${fecha}${ultimoError ? ' (con errores en el fetch)' : ''}`);
    return;
  }

  const filas = [];
  for (const p of partidosExtraidos) {
    if (!p.equipo_local || !p.equipo_visitante) {
      console.warn('[fetch-ia] partido sin equipos, se ignora:', p);
      continue;
    }
    const estado = ESTADOS_VALIDOS.has(p.estado) ? p.estado : 'programado';
    const equipoLocalId = await upsertEquipo(p.equipo_local);
    const equipoVisitanteId = await upsertEquipo(p.equipo_visitante);
    await upsert(
      'equipos_torneos',
      [
        { equipo_id: equipoLocalId, torneo_id: torneo.id },
        { equipo_id: equipoVisitanteId, torneo_id: torneo.id },
      ],
      'equipo_id,torneo_id'
    );

    filas.push({
      torneo_id: torneo.id,
      equipo_local_id: equipoLocalId,
      equipo_visitante_id: equipoVisitanteId,
      fecha,
      hora_local: p.hora_local_bogota || null,
      estado,
      marcador_local: p.marcador_local ?? null,
      marcador_visitante: p.marcador_visitante ?? null,
      canal: p.canal || null,
      fuente: 'ia',
      proveedor_ia: proveedor,
    });
  }

  await upsert('partidos', filas, 'torneo_id,equipo_local_id,equipo_visitante_id,fecha');
  await marcarFetchJob(torneo.id, fecha, 'listo');
  console.log(`[fetch-ia] listo. ${filas.length} partido(s) guardado(s) para ${torneoSlug} (${fecha})`);
  return filas.length;
}

if (esEjecucionDirecta(import.meta.url)) {
  const torneoSlug = process.argv[2];
  if (!torneoSlug) {
    console.error('Uso: node scripts/fetch-ia.js <slug-del-torneo> [YYYY-MM-DD]');
    process.exit(1);
  }
  fetchIa(torneoSlug, process.argv[3] || bogotaDateStr(new Date())).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
