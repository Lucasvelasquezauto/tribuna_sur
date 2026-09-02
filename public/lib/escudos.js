// Busca el escudo de un equipo en Wikipedia/Wikidata (gratis, sin key, CORS
// habilitado via origin=*). Se llama solo la primera vez que alguien
// favoritea un equipo sin escudo guardado (ver app.js) -- no hay job que
// llene los 256 equipos de una vez.
//
// Dos intentos, en orden:
// 1. PageImages de Wikipedia en español: rapido, funciona para la mayoria,
//    pero a veces no detecta el escudo como "imagen de la pagina" cuando es
//    un SVG (ej. RC Celta de Vigo).
// 1. Wikidata (propiedad P154, "imagen de logo"): mas confiable para esos
//    casos, pero no todos los clubes tienen el dato cargado ahi.
// Si ninguno encuentra nada, se devuelve null -- es un resultado valido
// (equipos menos conocidos pueden no tener escudo en ninguna fuente
// gratuita), no un error.

const CABECERAS = { 'Api-User-Agent': 'TribunaSurBot/1.0 (https://github.com/Lucasvelasquezauto/tribuna_sur)' };

async function porPageImages(nombre) {
  const url =
    `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(nombre)}` +
    `&prop=pageimages&piprop=thumbnail&pithumbsize=200&format=json&redirects=1&origin=*`;
  const res = await fetch(url, { headers: CABECERAS });
  if (!res.ok) return null;
  const data = await res.json();
  const pagina = Object.values(data.query?.pages ?? {})[0];
  return pagina?.thumbnail?.source ?? null;
}

async function porWikidata(nombre) {
  const url1 =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=eswiki&titles=${encodeURIComponent(nombre)}` +
    `&props=claims&format=json&origin=*`;
  const res1 = await fetch(url1, { headers: CABECERAS });
  if (!res1.ok) return null;
  const data1 = await res1.json();
  const entidades = data1.entities ?? {};
  const qid = Object.keys(entidades)[0];
  const logo = entidades[qid]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  if (!logo) return null;

  const url2 =
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + logo)}` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=200&format=json&origin=*`;
  const res2 = await fetch(url2, { headers: CABECERAS });
  if (!res2.ok) return null;
  const data2 = await res2.json();
  const pagina = Object.values(data2.query?.pages ?? {})[0];
  return pagina?.imageinfo?.[0]?.thumburl ?? null;
}

/** Devuelve una URL de imagen del escudo, o null si no se encontro en ninguna fuente. */
export async function buscarEscudo(nombreEquipo) {
  try {
    const directo = await porPageImages(nombreEquipo);
    if (directo) return directo;
    return await porWikidata(nombreEquipo);
  } catch {
    return null; // fallo de red puntual -- no bloquea el flujo de favoritos
  }
}
