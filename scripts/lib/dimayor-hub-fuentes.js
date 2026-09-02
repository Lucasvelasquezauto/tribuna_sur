// Los "hub" de Dimayor para Liga/Torneo/Copa Betplay traen la programacion
// oficial completa (fecha, hora, estadio, resultado) una vez renderizados --
// confirmado navegando en vivo el 2026-09-02, mucho mas completo y confiable
// que colombia.com/futbol/partidos-hoy/ para estos 3 torneos especificamente
// (ver CLAUDE.md seccion 13: se encontraron 2 partidos reales de Nacional que
// colombia.com/la prensa no tenian o tenian mal, y esta fuente si los tenia
// bien). Se usan como PRIMERA fuente para estos torneos, antes que las
// registradas en `fuentes_por_torneo`.

export const FUENTE_DIMAYOR_HUB = {
  'liga-betplay': { url: 'https://dimayor.com.co/liga-betplay-dimayor/', seleccionarTodasLasJornadas: true },
  'torneo-betplay': { url: 'https://dimayor.com.co/torneo-betplay-dimayor/', seleccionarTodasLasJornadas: true },
  'copa-betplay': { url: 'https://dimayor.com.co/copa-betplay-dimayor/', seleccionarTodasLasJornadas: false },
};
