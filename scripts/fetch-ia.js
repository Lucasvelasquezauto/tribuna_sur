// Fase 3/4 — extraccion via IA de partidos para los torneos sin API estructurada.
// Flujo: conseguir texto de la fuente (fetch plano, o renderizado si hace
// falta JS) -> pedirle a un LLM que devuelva JSON con el esquema fijo ->
// guardar en `partidos`. Ver CLAUDE.md seccion 6 y 13.
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
import { encontrarEquipoId } from './lib/match-equipo.js';
import { renderizarTexto } from './lib/render-page.js';
import { FUENTE_DIMAYOR_HUB } from './lib/dimayor-hub-fuentes.js';
import { recortarPorFecha } from './lib/recortar-por-fecha.js';
import { buscarTextoTavily, queryDescubrimiento, queryCuadroCopaBetplay } from './lib/tavily.js';

// Liga/Copa Betplay: Tavily agrega varias fuentes de prensa/oficiales
// independientes para la misma fecha (en vez de depender de una sola pagina),
// y a diferencia del hub de Dimayor SI funciona sin bloqueo desde IPs de
// GitHub Actions (confirmado en vivo el 2026-09-02, ver CLAUDE.md seccion
// 13) -- por eso va primero, antes que el hub renderizado (que solo sirve
// corriendolo local/manualmente) y antes que colombia.com.
const TORNEOS_CON_TAVILY = new Set(['liga-betplay', 'copa-betplay']);

// dimayor.com.co/category/programacion/ es un indice, no trae el detalle de los
// partidos -- se resuelve via la API de busqueda de WordPress a varios posts
// candidatos, y se prueban en orden de mas reciente a mas antiguo.
const ES_INDICE_DIMAYOR = (url) => url.includes('dimayor.com.co/category/programacion');

/**
 * Arma la lista ordenada de candidatos a intentar para extraer partidos:
 * primero Tavily (Liga/Copa Betplay, funciona desatendido -- ver arriba),
 * despues el hub de Dimayor renderizado (si el torneo tiene uno registrado,
 * solo funciona corriendolo local/manualmente, ver CLAUDE.md seccion 13),
 * despues las fuentes de `fuentes_por_torneo` en orden de prioridad
 * (resolviendo el indice de Dimayor a posts concretos si aparece entre
 * ellas).
 */
async function candidatosDeExtraccion(torneoSlug, torneoNombre, fuentesDb, fecha) {
  const candidatos = [];

  if (TORNEOS_CON_TAVILY.has(torneoSlug)) {
    const query = queryDescubrimiento(torneoNombre, fecha);
    candidatos.push({
      etiqueta: `Tavily: "${query}"`,
      obtenerTexto: () => buscarTextoTavily(query),
    });
  }

  // Copa Betplay en fase eliminatoria: si la busqueda por fecha no encuentra
  // nada, un segundo intento buscando el CUADRO COMPLETO de la fase (no
  // anclado a una fecha) suele traer los cruces con ida/vuelta ya definidos
  // en una sola fuente -- ver CLAUDE.md seccion 13, idea del usuario
  // ("busqueda hibrida" en vez de solo por fecha). Solo se intenta aca (no
  // en cada fecha) para no duplicar el gasto de creditos de Tavily en los
  // dias que la busqueda por fecha ya resuelve bien.
  if (torneoSlug === 'copa-betplay') {
    const queryCuadro = queryCuadroCopaBetplay();
    candidatos.push({
      etiqueta: `Tavily (cuadro completo): "${queryCuadro}"`,
      obtenerTexto: () => buscarTextoTavily(queryCuadro),
    });
  }

  const hub = FUENTE_DIMAYOR_HUB[torneoSlug];
  if (hub) {
    candidatos.push({
      etiqueta: `hub Dimayor (renderizado): ${hub.url}`,
      obtenerTexto: () => renderizarTexto(hub.url, { seleccionarTodasLasJornadas: hub.seleccionarTodasLasJornadas }),
    });
  }

  for (const fuente of fuentesDb) {
    if (ES_INDICE_DIMAYOR(fuente.url)) {
      // Resolver el indice de Dimayor implica una llamada de red aparte (la
      // API de busqueda de WordPress) -- si esa llamada falla (ej. 403 por
      // bloqueo anti-bot en IPs de datacenter, visto en GitHub Actions el
      // 2026-09-02), no debe tumbar TODA la lista de candidatos, solo esta
      // fuente puntual. Ver CLAUDE.md seccion 13.
      try {
        const posts = await buscarPostsDimayor(torneoNombre);
        if (posts.length === 0) console.log('[fetch-ia] busqueda en dimayor.com.co sin resultados para este torneo');
        for (const post of posts) {
          candidatos.push({ etiqueta: post.url, obtenerTexto: () => fetchAsText(post.url) });
        }
      } catch (err) {
        console.error('[fetch-ia] no se pudo resolver el indice de dimayor.com.co:', err.message);
      }
    } else {
      candidatos.push({ etiqueta: fuente.url, obtenerTexto: () => fetchAsText(fuente.url) });
    }
  }

  return candidatos;
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

/**
 * Resuelve el id de un equipo por nombre. Primero intenta por slug exacto;
 * si no hay, busca por tokens entre los equipos YA CONOCIDOS de este torneo
 * (`candidatos`, mutado en el sitio) antes de crear uno nuevo -- evita que
 * "Envigado" y "Envigado FC" (variantes de nombre entre corridas) terminen
 * como dos equipos y dos partidos distintos. Ver CLAUDE.md seccion 13.
 */
async function resolverEquipoId(nombre, candidatos) {
  const slug = slugify(nombre);
  const [exacto] = await select('equipos', `select=id&slug=eq.${slug}`);
  if (exacto) return exacto.id;

  const idFuzzy = encontrarEquipoId(nombre, candidatos);
  if (idFuzzy) return idFuzzy;

  const [nuevo] = await upsert('equipos', [{ nombre, slug }], 'slug');
  candidatos.push({ id: nuevo.id, nombre });
  return nuevo.id;
}

const VENTANA_DUPLICADO_DIAS = 10;

/**
 * Salvaguarda contra reprogramaciones mal resueltas: si el mismo cruce
 * (mismos dos equipos, cualquier orden) ya tiene una fila 'programado' en
 * este torneo dentro de +-VENTANA_DUPLICADO_DIAS de la fecha nueva, no crear
 * una segunda fila -- mejor omitir y dejar log que arriesgarse a mostrar dos
 * fechas distintas para lo que probablemente es el mismo partido. No
 * reemplaza al prompt (seccion "Reprogramaciones" en gemini.js), es un
 * respaldo cuando la fuente no trae suficiente contexto para que el modelo
 * lo resuelva solo -- ver CLAUDE.md seccion 13, caso Nacional-Cali.
 */
async function otraFechaPendienteParaElCruce(torneoId, equipoLocalId, equipoVisitanteId, fecha) {
  const desde = sumarDiasISO(fecha, -VENTANA_DUPLICADO_DIAS);
  const hasta = sumarDiasISO(fecha, VENTANA_DUPLICADO_DIAS);
  const filtro =
    `select=id,fecha&torneo_id=eq.${torneoId}&estado=eq.programado&fecha=neq.${fecha}` +
    `&fecha=gte.${desde}&fecha=lte.${hasta}` +
    `&or=(and(equipo_local_id.eq.${equipoLocalId},equipo_visitante_id.eq.${equipoVisitanteId}),and(equipo_local_id.eq.${equipoVisitanteId},equipo_visitante_id.eq.${equipoLocalId}))`;
  const existentes = await select('partidos', filtro);
  return existentes[0] ?? null;
}

function sumarDiasISO(fechaStr, dias) {
  const d = new Date(`${fechaStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
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

  const fuentesDb = await select(
    'fuentes_por_torneo',
    `select=url,prioridad&torneo_id=eq.${torneo.id}&activo=eq.true&order=prioridad.asc`
  );

  const candidatos = await candidatosDeExtraccion(torneoSlug, torneo.nombre, fuentesDb, fecha);
  if (candidatos.length === 0) throw new Error(`Sin fuentes para ${torneoSlug}`);

  console.log(`[fetch-ia] torneo=${torneoSlug} fecha=${fecha} proveedor=${proveedor} candidatos=${candidatos.length}`);
  await marcarFetchJob(torneo.id, fecha, 'en_curso');

  let partidosExtraidos = [];
  let ultimoError = null;
  const nombres = nombresParaPrompt(torneoSlug, torneo.nombre);

  for (const c of candidatos) {
    try {
      console.log(`[fetch-ia] intentando: ${c.etiqueta}`);
      let texto = await c.obtenerTexto();
      if (texto.length > 20000) texto = recortarPorFecha(texto, fecha); // paginas de temporada completa (hubs de Dimayor)
      partidosExtraidos = await extraer(texto, fecha, nombres);
      console.log(`[fetch-ia]   ${partidosExtraidos.length} partido(s) extraidos`);
      if (partidosExtraidos.length > 0) break;
    } catch (err) {
      ultimoError = err;
      console.error(`[fetch-ia]   ${c.etiqueta} fallo:`, err.message);
    }
  }

  if (partidosExtraidos.length === 0) {
    await marcarFetchJob(torneo.id, fecha, ultimoError ? 'error' : 'listo');
    console.log(`[fetch-ia] sin partidos para ${torneoSlug} en ${fecha}${ultimoError ? ' (con errores en el fetch)' : ''}`);
    return;
  }

  const candidatosEquipos = (
    await select('equipos_torneos', `select=equipo:equipo_id(id,nombre)&torneo_id=eq.${torneo.id}`)
  ).map((c) => c.equipo);

  const filas = [];
  for (const p of partidosExtraidos) {
    if (!p.equipo_local || !p.equipo_visitante) {
      console.warn('[fetch-ia] partido sin equipos, se ignora:', p);
      continue;
    }
    const estado = ESTADOS_VALIDOS.has(p.estado) ? p.estado : 'programado';
    const equipoLocalId = await resolverEquipoId(p.equipo_local, candidatosEquipos);
    const equipoVisitanteId = await resolverEquipoId(p.equipo_visitante, candidatosEquipos);

    if (estado === 'programado') {
      const otra = await otraFechaPendienteParaElCruce(torneo.id, equipoLocalId, equipoVisitanteId, fecha);
      if (otra) {
        console.warn(
          `[fetch-ia] omitido por posible reprogramacion sin resolver: ${p.equipo_local} vs ${p.equipo_visitante} en ${fecha} ya existe 'programado' en ${otra.fecha} (partido id ${otra.id}) -- revisar a mano cual fecha es la correcta`
        );
        continue;
      }
    }

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
