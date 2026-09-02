import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} -> ${res.status}`);
  return res.json();
}

// Unica escritura que hace el frontend: llenar equipos.escudo_url la primera
// vez que alguien favoritea un equipo sin escudo guardado. La clave anon solo
// tiene permiso de UPDATE en esa columna, y solo si esta vacia (sql/003_escudos.sql)
// -- si el PATCH falla (otro usuario ya lo lleno, RLS lo bloquea, etc.) no es un
// error real, simplemente no hay nada que guardar.
async function patchEscudo(equipoId, escudoUrl) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipos?id=eq.${equipoId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ escudo_url: escudoUrl }),
  });
  return res.ok;
}

export const supabase = { get, patchEscudo };
