// Algunos modelos (sobre todo via el auto-router "openrouter/free", que puede
// caer en modelos que no respetan response_format estrictamente) envuelven el
// JSON en fences de markdown pese a que se les pide JSON puro. Este helper lo
// tolera antes de parsear.

export function parsearJSONDeLLM(texto) {
  const limpio = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(limpio);
}
