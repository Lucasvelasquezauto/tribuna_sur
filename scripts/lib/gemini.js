// Cliente minimo para Google AI Studio (Gemini). Modelo elegido: gemini-3.5-flash-lite
// (ver CLAUDE.md seccion 13 para el historial: gemini-3.5-flash tiene cuota gratuita
// muy chica en preview -- 20 req/dia, 5/min, medido el 2026-09-01 --, y gemini-2.5-flash
// ya no esta disponible para cuentas nuevas de Google AI Studio).

import { conReintentos } from './retry.js';
import { parsearJSONDeLLM } from './json.js';

const MODEL = 'gemini-3.5-flash-lite';

export async function extraerPartidosConGemini(textoFuente, fecha, torneoNombre) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');

  const prompt = buildPrompt(textoFuente, fecha, torneoNombre);

  const data = await conReintentos(async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${body}`);
    }
    return res.json();
  });
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Respuesta de Gemini sin contenido: ${JSON.stringify(data)}`);

  const parsed = parsearJSONDeLLM(text);
  return Array.isArray(parsed.partidos) ? parsed.partidos : [];
}

export function buildPrompt(textoFuente, fecha, torneoNombre) {
  return `Eres un extractor de datos deportivos. A continuacion hay texto extraido de una pagina web con programacion de partidos de futbol. La pagina puede mezclar partidos de MUCHOS torneos y paises distintos.

Tu tarea: encontrar SOLO los partidos del torneo "${torneoNombre}" que se jueguen en la fecha ${fecha} (formato YYYY-MM-DD).

Reglas estrictas:
- Ignora por completo cualquier partido de otro torneo, aunque sea de la misma fecha (ej. si te piden "${torneoNombre}" y ves partidos de otras ligas, copas o paises, NO los incluyas).
- Ignora partidos de otras fechas.
- Si el texto no deja claro a que torneo pertenece un partido, NO lo incluyas (mejor omitir que adivinar).
- Si no encuentras ningun partido de "${torneoNombre}" en la fecha ${fecha}, responde {"partidos": []}. Es un resultado valido y esperado la mayoria de los dias.

Responde UNICAMENTE con un JSON con este esquema exacto, sin explicaciones ni texto adicional:

{
  "partidos": [
    {
      "equipo_local": "string",
      "equipo_visitante": "string",
      "hora_local_bogota": "HH:MM en formato 24h, hora de Bogota (Colombia, UTC-5), o null si el partido ya se jugo",
      "estado": "programado | finalizado | pospuesto",
      "marcador_local": "number o null si no se ha jugado",
      "marcador_visitante": "number o null si no se ha jugado",
      "canal": "string con el canal de TV o plataforma de streaming en Colombia, o null si no se encuentra ese dato"
    }
  ]
}

No inventes datos: si un campo no aparece claramente en el texto, usa null en vez de adivinar.

Texto fuente:
"""
${textoFuente}
"""`;
}
