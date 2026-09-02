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
- **Documentos con VARIAS fechas mezcladas (MUY IMPORTANTE, no solo tablas):** el texto suele traer partidos de MUCHAS fechas distintas juntos en un mismo documento -- puede ser una tabla literal con columna FECHA (ej. "Calendario de [Equipo] 2026" de ESPN), pero tambien puede ser un articulo de prensa en prosa que organiza la informacion por secciones ("FECHA 4... Miércoles 19 de agosto... FECHA 6... Viernes 21 de agosto... FECHA 7... Miércoles 26 de agosto..."), sin ninguna tabla HTML de por medio. En AMBOS casos aplica la misma regla: cada partido tiene su PROPIA fecha asociada (la fila de la tabla, o la seccion/encabezado de fecha bajo el que aparece en el articulo) -- teneis que identificar esa fecha exacta antes de incluir el partido, NUNCA asumir que un partido es de la fecha ${fecha} solo porque el equipo o el partido aparecio en los resultados de esta búsqueda, o porque no encontraste la fecha explícita de otra forma mas facil. Tres casos reales que pasaron por confundir esto: (1) se extrajo "Cúcuta Deportivo vs Internacional de Bogotá" para una fecha cuando la fuente decía claramente que ese partido fue semanas antes (tabla); (2) se extrajo "Deportivo Pasto vs Independiente Medellín" para una fecha cuando la fuente decía que era una semana despues (tabla); (3) se extrajo "Atlético Nacional vs Deportivo Cali" para el 24 de agosto cuando un articulo de prensa en prosa (organizado por secciones "FECHA 4", "FECHA 6", "FECHA 7"...) dejaba claro, en su propia seccion "FECHA 7", que ese partido especifico fue el 26 de agosto -- dos fuentes independientes lo confirmaron. Si no podés confirmar con certeza a que fecha especifica corresponde un partido dentro de un documento asi, NO lo incluyas (mejor omitir que adivinar la fecha).
- Si el texto no deja claro a que torneo pertenece un partido, NO lo incluyas (mejor omitir que adivinar).
- Si no encuentras ningun partido de este torneo en la fecha ${fecha}, responde {"partidos": []}. Es un resultado valido y esperado la mayoria de los dias.
- El texto puede venir de varias fuentes independientes para la misma fecha (busquedas, no una sola pagina). Si distintas fuentes no coinciden en la hora de un mismo partido (equipos iguales, fecha igual), usa la hora que aparezca en MAS fuentes -- es probable que la fuente en minoria tenga un dato viejo de antes de una reprogramacion. Si hay empate o solo una fuente, usa esa.
  - **Esta regla de mayoria manda incluso sobre fuentes que parezcan "oficiales".** dimayor.com.co en particular carga su calendario por JavaScript, y el texto que llega de una busqueda (ya indexado, no renderizado en vivo) puede traer horas desalineadas entre partidos -- confirmado con un caso real: el texto traia "Independiente Santa Fe VS Millonarios F.C. 17:30" en el listado de dimayor.com.co, pero DOS fuentes de prensa independientes (una explicitamente fechada "HOY", listando el partido junto a otros con hora exacta) coincidian en "8:25/8:30 p.m." -- la respuesta correcta es 8:25/8:30 PM (2 fuentes) y NO 17:30 (1 fuente, y la mas propensa a error de las dos por como se genera esa pagina). No le des mas peso a dimayor.com.co por parecer la fuente oficial: si la mayoria de fuentes de prensa independientes coinciden en otra hora, esa es la correcta.
- Reprogramaciones (MUY IMPORTANTE, revisa esto con cuidado): si el texto menciona que un partido fue APLAZADO, REPROGRAMADO, o tiene "NUEVO HORARIO"/"cambio de programacion" a una fecha distinta de una fecha anunciada originalmente para ese mismo partido (mismos dos equipos), la fecha reprogramada manda sobre la original -- ignora la fecha original por completo para ese partido. Ejemplo concreto: si un texto dice "Equipo A vs Equipo B, miercoles 2 de septiembre" en un lugar, y en otro lugar del mismo texto dice "cambio en la programacion: Equipo A vs Equipo B se jugara el lunes 7 de septiembre", el partido va SOLO en el 7 de septiembre, nunca en el 2. Si te piden extraer los partidos del ${fecha} y un partido de esa fecha exacta aparece mencionado en el texto junto con evidencia de que fue reprogramado a OTRA fecha, NO lo incluyas (ya no es de esa fecha). Si te piden extraer los partidos del ${fecha} y encuentras evidencia de que un partido fue reprogramado A esa fecha (desde otra fecha original), SI inclúyelo.
  - **Un anuncio de reprogramacion ("se reprogramo para el X") es un PLAN, no un hecho confirmado -- ese plan mismo puede quedar superado despues por otra fecha distinta, incluso mas tarde que la anunciada.** Si el texto TAMBIEN incluye una cronica o resumen YA PUBLICADO de ese partido (lenguaje en pasado: "goleo", "empato", "rescato el empate", resultado final, jugadores expulsados, etc.) con una fecha propia (ej. en la URL de la fuente o en la primera oracion del articulo), esa fecha del partido YA JUGADO manda sobre cualquier anuncio de reprogramacion a otra fecha, sin importar cual de los dos textos suene mas reciente o mas especifico. Caso real: un articulo decia "el partido se reprogramo para el 2 de septiembre", pero otro articulo (con la fecha en su propia URL) confirmaba que ese mismo partido, con el mismo resultado y los mismos goleadores, ya se habia jugado el 19 de agosto -- la fecha del 2 de septiembre era un plan que quedo superado, no lo que realmente paso. Prioriza siempre evidencia de un partido YA JUGADO (resultado, cronica en pasado) sobre un anuncio de una fecha futura planeada.
- Nombres de equipo: usa el nombre completo del equipo (ej. "Deportivo Cali"), nunca una sigla o codigo corto (ej. "DCI", "NAL", "AGD" -- codigos que usa ESPN en sus calendarios). Si el UNICO lugar donde aparece un equipo es como sigla/codigo sin su nombre completo en ninguna otra parte del texto, NO incluyas ese partido (mejor omitir que adivinar a que equipo corresponde la sigla).
- **Formato de la fase (ida/vuelta vs. partido unico):** algunos torneos cambian de formato durante la temporada (ej. Copa Betplay paso de ida/vuelta a partido unico en octavos y cuartos de 2026 por un terremoto, y volvio a ida/vuelta en semifinal). Si el texto menciona explicitamente que una fase se juega "a partido unico" (o "unico partido", "partido eliminatorio directo"), y en OTRA parte del texto aparece un "partido de vuelta" para un cruce de esa misma fase, ese "partido de vuelta" es informacion vieja de ANTES del cambio de formato -- ignoralo, ese cruce es un solo partido. No asumas ida/vuelta solo porque una fuente vieja lo menciona asi.
- **Fechas en UTC (MUY IMPORTANTE):** algunas fuentes (ej. Sofascore) dan la fecha/hora en UTC en vez de hora de Bogota. Bogota es UTC-5, asi que un partido nocturno (7pm-11:59pm hora Bogota) cae en el dia SIGUIENTE cuando se expresa en UTC -- ej. "2 de septiembre, 1:00 UTC" es en realidad "1 de septiembre, 8:00 PM hora Bogota" (le restas 5 horas Y eso te puede mover al dia anterior). Caso real que paso por esto: se extrajo "Fortaleza vs Once Caldas" para el 2 de septiembre por una fuente que decia "2 sept, 1:00 UTC", pero el partido fue en realidad el 1 de septiembre a las 6-8pm hora Bogota (confirmado por ESPN con resultado final 1-2, partido YA JUGADO ese dia). Si una fuente da una hora que claramente es UTC (dice "UTC", "GMT", o el numero no tiene sentido como hora local de un partido en Colombia, ej. "3:00 AM"), conviertila a hora de Bogota (restar 5 horas) ANTES de decidir a que fecha del calendario pertenece -- no uses la fecha tal cual aparece en la fuente si esta en UTC.

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
