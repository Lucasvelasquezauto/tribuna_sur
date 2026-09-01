// Reintento simple con backoff para llamadas a APIs de IA en tier gratuito,
// donde un 429/503 por alta demanda es comun y casi siempre transitorio.

export async function conReintentos(fn, { intentos = 3, esperaMs = 3000 } = {}) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      const esReintentable = /\b(429|503)\b/.test(err.message);
      if (!esReintentable || i === intentos - 1) throw err;
      console.warn(`[reintento] intento ${i + 1}/${intentos} fallo (${err.message.slice(0, 80)}...), reintentando en ${esperaMs}ms`);
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
  throw ultimoError;
}
