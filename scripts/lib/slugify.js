const DIACRITICS = /[̀-ͯ]/g;

export function slugify(nombre) {
  return nombre
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/\./g, '') // "F.C." -> "fc", no "f-c": sin esto, "Llaneros F.C." y "Llaneros FC" generaban equipos distintos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function bogotaDateStr(date) {
  // America/Bogota es UTC-5 fijo (sin horario de verano).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // en-CA -> YYYY-MM-DD
}

export function bogotaTimeStr(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date); // HH:MM
}
