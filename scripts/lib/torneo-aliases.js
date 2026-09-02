// Distintas fuentes llaman al mismo torneo de formas distintas (ej.
// colombia.com/futbol/partidos-hoy/ etiqueta la Copa Betplay como
// "Copa Colombia" -- su nombre historico/generico, sin el patrocinador). El
// prompt de extraccion necesita reconocer cualquiera de estos nombres, no solo
// el que esta guardado en `torneos.nombre`. Encontrado el 2026-09-02: la Copa
// Betplay de HOY (Deportes Quindio vs Llaneros FC) no se extrajo la primera
// vez por esto -- ver CLAUDE.md seccion 13.

export const ALIASES_TORNEO = {
  'liga-betplay': ['Liga Betplay', 'Categoría Primera A', 'Primera A'],
  'copa-betplay': ['Copa Betplay', 'Copa Colombia'],
  'torneo-betplay': ['Torneo Betplay', 'Categoría Primera B', 'Primera B'],
  'champions-league': ['Champions League', 'UEFA Champions League', 'Liga de Campeones'],
  'europa-league': ['UEFA Europa League', 'Europa League', 'Liga Europa'],
  bundesliga: ['Bundesliga'],
  'premier-league': ['Premier League', 'English Premier League'],
  laliga: ['LaLiga', 'La Liga', 'LaLiga Santander', 'LaLiga EA Sports', 'Primera División de España'],
  'copa-libertadores': ['Copa Libertadores', 'CONMEBOL Libertadores'],
  'copa-sudamericana': ['Copa Sudamericana', 'CONMEBOL Sudamericana'],
};

/** Nombres a pasar al prompt: el de la tabla `torneos` + alias conocidos, sin duplicados. */
export function nombresParaPrompt(torneoSlug, torneoNombre) {
  const alias = ALIASES_TORNEO[torneoSlug] ?? [];
  return [...new Set([torneoNombre, ...alias])];
}
