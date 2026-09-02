// Preferencias del usuario: se guardan en localStorage, no en Supabase (MVP,
// ver CLAUDE.md seccion 7).

const KEY_TORNEOS = 'ts_torneos_activos';
const KEY_FAVORITOS = 'ts_favoritos';

function leerJSON(key, porDefecto) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJSON(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // localStorage no disponible (modo privado, etc.) -- la app sigue funcionando,
    // solo no persiste preferencias entre sesiones.
  }
}

export function getTorneosActivos(torneosPorDefecto) {
  const guardado = leerJSON(KEY_TORNEOS, null);
  return guardado ?? torneosPorDefecto;
}

export function setTorneosActivos(slugs) {
  guardarJSON(KEY_TORNEOS, slugs);
}

export function getFavoritos() {
  return leerJSON(KEY_FAVORITOS, []);
}

export function setFavoritos(ids) {
  guardarJSON(KEY_FAVORITOS, ids);
}
