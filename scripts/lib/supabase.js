// Cliente minimo para la REST API de Supabase (PostgREST), sin dependencias.
// Usa la service_role key: bypassea RLS, pensado solo para jobs server-side.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

async function restRequest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Upsert de filas en `table`, resolviendo conflicto por `onConflict` (nombre de columna(s), coma-separado). */
export async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return [];
  return restRequest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

export async function select(table, query) {
  return restRequest(`${table}?${query}`, { method: 'GET' });
}

/**
 * Actualiza columnas parciales de filas existentes que cumplan `filtro`
 * (query string estilo PostgREST, ej. "id=eq.1"). A diferencia de `upsert`
 * (que es un INSERT ... ON CONFLICT y por eso exige que el payload incluya
 * todas las columnas NOT NULL de la tabla, aunque la fila ya exista), esto es
 * un PATCH real -- sirve para tocar un solo campo como `canal` sin arrastrar
 * el resto de la fila.
 */
export async function patch(table, filtro, cambios) {
  return restRequest(`${table}?${filtro}`, {
    method: 'PATCH',
    body: cambios,
    prefer: 'return=minimal',
  });
}
