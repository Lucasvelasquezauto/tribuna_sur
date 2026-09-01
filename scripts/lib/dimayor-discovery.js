// dimayor.com.co corre en WordPress y expone su API REST estandar
// (wp-json/wp/v2/posts?search=...), mucho mas confiable que raspar el HTML del
// indice /category/programacion/ (que mezcla navegacion, widgets, etc. y no
// siempre refleja el post mas relevante en orden). Sigue dentro del espiritu de
// CLAUDE.md seccion 6: esto solo encuentra CUALES posts mirar; el contenido de
// cada post lo sigue interpretando el LLM, no un parser estructurado.

export async function buscarPostsDimayor(torneoNombre, { limite = 5 } = {}) {
  const url = `https://dimayor.com.co/wp-json/wp/v2/posts?search=${encodeURIComponent(torneoNombre)}&per_page=${limite}&orderby=date&order=desc&_fields=id,date,link,title`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TribunaSurBot/1.0)' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const posts = await res.json();
  return posts.map((p) => ({ url: p.link, titulo: p.title?.rendered, fecha: p.date }));
}
