// Tavily (api.tavily.com) -- API de busqueda para agentes de IA, con tier
// gratuito real (1000 creditos/mes, sin tarjeta, se renuevan cada mes -- no
// es una prueba con fecha de expiracion). Se usa para Liga/Copa Betplay en
// vez de una sola fuente fija: a diferencia de scrapear una pagina puntual
// (colombia.com, el hub de Dimayor), una busqueda agrega varias fuentes de
// prensa/oficiales independientes para la misma fecha, lo cual evita el modo
// de falla que origino este cambio (una sola fuente con informacion vieja).
// Confirmado que responde 200 con resultados reales tanto desde una IP
// residencial como desde IPs de GitHub Actions (a diferencia de scrapear
// paginas directamente, que si bloquean por IP de datacenter -- ver
// CLAUDE.md seccion 13, 2026-09-02).

import { conReintentos } from './retry.js';

// Lista de dominios de prensa/oficiales colombianos verificados confiables
// durante esta sesion (nunca dieron un dato incorrecto cuando se revisaron
// directamente). Usar `include_domains` en vez de buscar en todo internet es
// el cambio real pedido por el usuario el 2026-09-02: "escoger fuentes
// confiables, no multiples" -- en vez de que el modelo reconcilie senales de
// fuentes de calidad muy dispar, la busqueda misma ya viene acotada a fuentes
// buenas. Ver CLAUDE.md seccion 13 para el detalle de cada bug que motivo
// esta lista.
//
// Deliberadamente NO incluye (causaron bugs reales esta sesion):
// - espndeportes.espn.com / espn.com: sus tablas-calendario de un equipo
//   (decenas de fechas en una sola tabla) causaron 2 casos reales de un
//   partido de otra fecha atribuido a la fecha buscada.
// - sofascore.com: da horarios en UTC sin dejarlo claro, causo que un
//   partido de AYER (hora Bogota) se tomara como de HOY.
// - valuestats.com: horarios inconsistentes con el resto de fuentes.
const DOMINIOS_CONFIABLES = [
  'dimayor.com.co',
  'winsports.co',
  'futbolred.com',
  'colombia.com',
  'noticiascaracol.com',
  'caracol.com.co',
  'elespectador.com',
  'elpais.com.co',
  'eltiempo.com',
  'semana.com',
  'as.com',
  'espn.com.co', // distinto de espndeportes.espn.com -- este SI se uso bien esta sesion (nota-articulo, no tabla-calendario)
];

/**
 * Busca en Tavily y devuelve los resultados concatenados como texto plano,
 * en el mismo formato que espera el prompt de extraccion (buildPrompt en
 * gemini.js): titulo + contenido de cada resultado, con la URL como
 * referencia de fuente.
 */
export async function buscarTextoTavily(query, { maxResultados = 8 } = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('Falta TAVILY_API_KEY');

  const data = await conReintentos(async () => {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        // 'advanced' trae mas resultados/contenido por consulta que 'basic'.
        // Vale la pena el costo extra de creditos (2 en vez de 1, muy por
        // debajo de los 1000/mes gratis con el volumen de este proyecto):
        // una sola fuente desactualizada puede tener el mismo problema que
        // origino este cambio (ver CLAUDE.md seccion 13, caso Nacional-Cali
        // 7-sep: la primera consulta trajo 1 resultado con hora vieja de
        // antes de una reprogramacion; una consulta con mas resultados trajo
        // 5 fuentes independientes, incluyendo posts de "cambio de horario",
        // que coincidian en la hora correcta).
        search_depth: 'advanced',
        max_results: maxResultados,
        // Fuentes acotadas a una lista curada (ver arriba) en vez de todo
        // internet -- reduce la necesidad de que el modelo reconcilie
        // senales de fuentes de calidad muy dispar.
        include_domains: DOMINIOS_CONFIABLES,
        // 'month' en vez de 'week': se probo con 'week' y redujo demasiado
        // la cobertura de Tavily para fechas lejanas (+7 a +13 dias), que es
        // justo la ventana que Tavily existe para cubrir -- cayo al hub de
        // Dimayor (que no funciona en CI) en vez de encontrar algo util. El
        // riesgo de articulos viejos con un PLAN superado (caso real:
        // "se reprogramo para tal fecha" que despues no se cumplio) ya lo
        // cubre la regla de "prioriza lo ya jugado sobre un plan" en el
        // prompt de extraccion (gemini.js) -- no hace falta ademas cortar
        // por fecha de publicacion tan agresivo.
        time_range: 'month',
        topic: 'news',
        country: 'colombia',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Tavily ${res.status}: ${body}`);
    }
    return res.json();
  });

  const resultados = data.results || [];
  if (resultados.length === 0) return '';

  return resultados
    .map((r) => `Fuente: ${r.url}\nTitulo: ${r.title}\n${r.content}`)
    .join('\n\n---\n\n')
    .slice(0, 60000);
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-09-13" -> "13 de septiembre de 2026", para armar queries en espanol. */
export function fechaEnEspanol(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

// "reprogramacion" en la query es a proposito: una busqueda anclada solo a
// la fecha objetivo tiende a traer el anuncio ORIGINAL de un partido incluso
// si ya fue aplazado (el post que corrige el horario menciona la fecha
// NUEVA, no la vieja, asi que una query sin este termino nunca lo encuentra)
// -- ver CLAUDE.md seccion 13, caso Nacional-Cali: la query anclada al 2 de
// septiembre (fecha original, ya superada) no traia ninguna de las 4+
// fuentes que anunciaban el cambio a 7 de septiembre.
export function queryDescubrimiento(nombreTorneo, fechaISO) {
  return `${nombreTorneo} Colombia partidos ${fechaEnEspanol(fechaISO)} hora canal television reprogramacion cambio de horario`;
}
