// Cliente minimo para OpenRouter. Modelo elegido: z-ai/glm-5.2:free
// (confirmado gratuito via GET https://openrouter.ai/api/v1/models al 2026-09-01,
// ver CLAUDE.md seccion 13 — el catalogo gratuito de OpenRouter cambia, revisar
// si este modelo deja de estar disponible sin costo).

import { buildPrompt } from './gemini.js';

const MODEL = 'z-ai/glm-5.2:free';

export async function extraerPartidosConOpenRouter(textoFuente, fecha, torneoNombre) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY');

  const prompt = buildPrompt(textoFuente, fecha, torneoNombre);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Lucasvelasquezauto/tribuna_sur',
      'X-Title': 'Tribuna Sur',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Respuesta de OpenRouter sin contenido: ${JSON.stringify(data)}`);

  const parsed = JSON.parse(text);
  return Array.isArray(parsed.partidos) ? parsed.partidos : [];
}
