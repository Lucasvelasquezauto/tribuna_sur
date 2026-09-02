// Fuentes para poblar el ROSTER (lista de equipos participantes) de los 6
// torneos sin API estructurada -- distinto de `fuentes_por_torneo` (que es
// para partidos del dia). Wikipedia mantiene una tabla limpia y actualizada
// de equipos participantes por temporada para cada uno de estos torneos, es
// una fuente mucho mas estable para "quienes juegan esta temporada" que
// cualquiera de las fuentes de partidos del dia. Ver CLAUDE.md seccion 13.

export const FUENTE_ROSTER = {
  'liga-betplay': 'https://en.wikipedia.org/wiki/2026_Liga_DIMAYOR',
  'torneo-betplay': 'https://en.wikipedia.org/wiki/2026_Torneo_DIMAYOR',
  'copa-betplay': 'https://en.wikipedia.org/wiki/2026_Copa_Colombia',
  'copa-libertadores': 'https://en.wikipedia.org/wiki/2026_Copa_Libertadores',
  'copa-sudamericana': 'https://en.wikipedia.org/wiki/2026_Copa_Sudamericana',
  'europa-league': 'https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Europa_League_league_phase',
};
