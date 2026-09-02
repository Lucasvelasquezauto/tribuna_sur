// Extraccion de la lista de equipos participantes de un torneo (para poblar
// el buscador de favoritos, ver CLAUDE.md seccion 13) -- distinto de
// extraerPartidosConGemini, que extrae partidos de un dia. Mismo patron
// (bajar HTML, limpiar a texto, pedirle a un LLM un JSON con esquema fijo)
// pero sin fecha ni marcador: solo nombres de equipo.

import { generarJSONConGemini } from './gemini.js';

export async function extraerEquiposConGemini(textoFuente, torneoNombre) {
  const prompt = `Eres un extractor de datos deportivos. A continuacion hay texto extraido de una pagina de Wikipedia sobre la temporada actual de un torneo de futbol.

Tu tarea: listar los nombres de TODOS los equipos que participan en "${torneoNombre}" segun este texto (ej. equipos clasificados, en la fase de grupos, en la tabla de posiciones, etc.).

Reglas:
- Devuelve el nombre del club tal como aparece en el texto (no lo traduzcas ni lo abrevies).
- No repitas el mismo equipo dos veces.
- No inventes equipos que no esten en el texto.
- Si el texto no trae ninguna lista clara de equipos, responde {"equipos": []}.

Responde UNICAMENTE con un JSON con este esquema exacto, sin explicaciones ni texto adicional:

{
  "equipos": ["string", "string", ...]
}

Texto fuente:
"""
${textoFuente}
"""`;

  const parsed = await generarJSONConGemini(prompt);
  return Array.isArray(parsed.equipos) ? parsed.equipos : [];
}
