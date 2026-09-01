import { slugify } from './slugify.js';

// Distintas fuentes nombran al mismo equipo distinto (ej. football-data.org da
// "Real Sociedad de Futbol", una fuente de prensa da solo "Real Sociedad").
// En vez de exigir slug identico, compara por tokens: si todos los tokens del
// nombre mas corto aparecen en el mas largo, se considera el mismo equipo.
// Acotado a los equipos ya conocidos DE ESE TORNEO (equipos_torneos) para que
// una coincidencia parcial no cruce equipos de otros paises/torneos.

function tokens(nombre) {
  return new Set(slugify(nombre).split('-').filter(Boolean));
}

function esMismoEquipo(a, b) {
  const [chico, grande] = a.size <= b.size ? [a, b] : [b, a];
  if (chico.size === 0) return false;
  for (const t of chico) if (!grande.has(t)) return false;
  return true;
}

/** candidatos: [{id, nombre}]. Devuelve el id del candidato que matchea, o null si no hay uno solo. */
export function encontrarEquipoId(nombreExtraido, candidatos) {
  const t = tokens(nombreExtraido);
  const matches = candidatos.filter((c) => esMismoEquipo(t, tokens(c.nombre)));
  if (matches.length === 1) return matches[0].id;
  return null; // ninguno o ambiguo (mas de uno) -- mejor no actualizar que actualizar mal
}
