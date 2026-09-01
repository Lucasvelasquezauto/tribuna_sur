// Limpieza de HTML a texto plano, suficiente para que un LLM lo interprete
// (no hace falta ser exhaustivo, ver CLAUDE.md seccion 6).

export async function fetchAsText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TribunaSurBot/1.0; +https://github.com/Lucasvelasquezauto/tribuna_sur)',
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const html = await res.text();
  return htmlToText(html);
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 60000); // margen de sobra para el contexto del modelo, evita paginas gigantes
}
