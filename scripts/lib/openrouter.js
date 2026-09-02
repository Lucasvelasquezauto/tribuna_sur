// Cliente minimo para OpenRouter. Modelo elegido: openrouter/free (auto-router
// de OpenRouter entre varios modelos gratuitos). z-ai/glm-5.2:free y
// google/gemma-4-26b-a4b-it:free -- ambos confirmados gratuitos via GET
// https://openrouter.ai/api/v1/models -- dieron 429 "upstream_provider_shared_pool"
// persistente en pruebas seguidas el 2026-09-01; el auto-router evita quedar
// pegado a un solo backend congestionado. Contrapartida: el modelo que le toque
// no siempre respeta response_format estrictamente (a veces envuelve el JSON en
// fences de markdown, ver ./json.js). Ver CLAUDE.md seccion 13.

import { buildPrompt } from './gemini.js';
import { conReintentos } from './retry.js';
import { parsearJSONDeLLM } from './json.js';

const MODEL = 'openrouter/free';

export async function extraerPartidosConOpenRouter(textoFuente, fecha, nombresTorneo) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY');

  const prompt = buildPrompt(textoFuente, fecha, nombresTorneo);

  const data = await conReintentos(async () => {
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
    return res.json();
  });
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Respuesta de OpenRouter sin contenido: ${JSON.stringify(data)}`);

  const parsed = parsearJSONDeLLM(text);
  return Array.isArray(parsed.partidos) ? parsed.partidos : [];
}
