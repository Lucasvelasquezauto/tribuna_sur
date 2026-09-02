// Cliente minimo para Google AI Studio (Gemini). Modelo elegido: gemini-3.5-flash-lite
// (ver CLAUDE.md seccion 13 para el historial: gemini-3.5-flash tiene cuota gratuita
// muy chica en preview -- 20 req/dia, 5/min, medido el 2026-09-01 --, y gemini-2.5-flash
// ya no esta disponible para cuentas nuevas de Google AI Studio).

import { conReintentos } from './retry.js';
import { parsearJSONDeLLM } from './json.js';

const MODEL = 'gemini-3.5-flash-lite';

/** Llamada de bajo nivel a Gemini: manda `prompt`, devuelve el JSON ya parseado de la respuesta. */
export async function generarJSONConGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');

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
  return parsearJSONDeLLM(text);
}

export async function extraerPartidosConGemini(textoFuente, fecha, nombresTorneo) {
  const prompt = buildPrompt(textoFuente, fecha, nombresTorneo);
  const parsed = await generarJSONConGemini(prompt);
  return Array.isArray(parsed.partidos) ? parsed.partidos : [];
}

export function buildPrompt(textoFuente, fecha, nombresTorneo) {
  const nombres = Array.isArray(nombresTorneo) ? nombresTorneo : [nombresTorneo];
  const nombresTexto = nombres.map((n) => `"${n}"`).join(', ');
  const nombrePrincipal = nombres[0];

  return `Eres un extractor de datos deportivos. A continuacion hay texto extraido de una pagina web con programacion de partidos de futbol. La pagina puede mezclar partidos de MUCHOS torneos y paises distintos.

Tu tarea: encontrar SOLO los partidos del torneo "${nombrePrincipal}" que se jueguen en la fecha ${fecha} (formato YYYY-MM-DD). Ese torneo puede aparecer en el texto con cualquiera de estos nombres (son el mismo torneo, distintas fuentes lo llaman distinto -- a veces con el patrocinador, a veces con su nombre generico/oficial): ${nombresTexto}.

Reglas estrictas:
- Ignora por completo cualquier partido de otro torneo, aunque sea de la misma fecha (si ves partidos de otras ligas, copas o paises que NO coinciden con ninguno de los nombres de arriba, NO los incluyas).
- Ignora partidos de otras fechas.
- Si el texto no deja claro a que torneo pertenece un partido, NO lo incluyas (mejor omitir que adivinar).
- Si no encuentras ningun partido de este torneo en la fecha ${fecha}, responde {"partidos": []}. Es un resultado valido y esperado la mayoria de los dias.

Reglas para la hora (hora_local_bogota): el texto fuente a veces trae la hora en formato de 12 horas con AM/PM (ej. "5:30 PM"). DEBES convertirla vos mismo a 24 horas antes de responder -- no la copies tal cual, ni le quites solo las letras "AM"/"PM" dejando el numero igual. Conversion correcta, con ejemplos exactos:
- "5:30 PM" -> "17:30" (sumar 12 a la hora cuando es PM y no es 12)
- "8:00 PM" -> "20:00"
- "2:00 PM" -> "14:00"
- "9:00 AM" -> "09:00" (la hora AM se queda igual, salvo 12 AM)
- "12:00 PM" (mediodia) -> "12:00"
- "12:00 AM" (medianoche) -> "00:00"
Un error muy comun y GRAVE es devolver "05:30" para "5:30 PM" -- eso esta MAL, la respuesta correcta es "17:30". Revisa tu conversion antes de responder.

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
