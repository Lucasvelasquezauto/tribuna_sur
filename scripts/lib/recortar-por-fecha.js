// Los hubs de Dimayor renderizan la TEMPORADA COMPLETA en una sola pagina
// (cientos de partidos) -- si se manda todo el texto tal cual, ademas de
// gastar contexto de mas, un limite de caracteres fijo (ej. 60000) podria
// cortar justo antes de la fecha que buscamos si esta mas adelante en la
// temporada. Esto busca el encabezado de fecha en español que usa Dimayor
// ("D DE MES DE AAAA") y recorta una ventana alrededor, para garantizar que
// la fecha pedida quede adentro sin importar donde caiga en el documento.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function etiquetaFechaDimayor(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return `${dia} DE ${MESES[mes - 1].toUpperCase()} DE ${anio}`;
}

/** Recorta `texto` a una ventana alrededor de la fecha pedida (o el texto completo, capado, si no la encuentra). */
export function recortarPorFecha(texto, fechaISO, { margenAntes = 3000, margenDespues = 8000 } = {}) {
  const idx = texto.indexOf(etiquetaFechaDimayor(fechaISO));
  if (idx === -1) return texto.slice(0, 60000); // no se encontro la fecha -- se manda el inicio, capado, y que el LLM responda vacio
  const inicio = Math.max(0, idx - margenAntes);
  const fin = Math.min(texto.length, idx + margenDespues);
  return texto.slice(inicio, fin);
}
