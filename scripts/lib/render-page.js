// Algunas fuentes (los "hub" de Dimayor para Liga/Torneo/Copa Betplay) cargan
// la programacion por JavaScript -- un fetch HTTP plano (fetchAsText) solo ve
// el HTML vacio. Esto usa un navegador headless (Playwright) para renderizar
// la pagina de verdad y devolver el texto ya poblado, listo para pasarle al
// LLM igual que cualquier otra fuente. Ver CLAUDE.md seccion 13.
//
// Nota de costo: esto es mas pesado que un fetch normal (baja un navegador
// Chromium), pero sigue siendo $0 -- corre dentro de los minutos gratis de
// GitHub Actions, no es un servicio de pago.

import { chromium } from 'playwright';

/**
 * Renderiza `url` y devuelve el texto visible de la pagina.
 * `seleccionarTodasLasJornadas`: si la pagina tiene el filtro de "Jornada" de
 * los hubs de Liga/Torneo Betplay, lo pone en "— Todas —" para traer la
 * temporada completa en vez de solo la vista por defecto (que solo muestra
 * el proximo partido + un adelanto de la ultima fecha).
 */
export async function renderizarTexto(url, { seleccionarTodasLasJornadas = false } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (seleccionarTodasLasJornadas) {
      const cambiado = await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')];
        const jornadaSelect = selects.find(
          (s) =>
            [...s.options].some((o) => o.text.trim() === '— Todas —') &&
            [...s.options].some((o) => o.text.includes('Jornada 1'))
        );
        if (!jornadaSelect) return false;
        jornadaSelect.value = '0';
        jornadaSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      });
      if (cambiado) await page.waitForTimeout(1500);
    }

    const texto = await page.innerText('body');
    return texto.slice(0, 300000); // limite generoso -- el recorte real por fecha lo hace recortar-por-fecha.js
  } finally {
    await browser.close();
  }
}
