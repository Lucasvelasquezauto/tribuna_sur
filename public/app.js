import { supabase } from './lib/supabase-client.js';
import { getTorneosActivos, setTorneosActivos, getFavoritos, setFavoritos } from './lib/storage.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  fecha: bogotaHoy(),
  vista: 'todos', // 'todos' | 'favoritos'
  torneos: [], // catalogo completo, cargado una vez
  equipos: [], // catalogo completo, cargado una vez (para buscador de favoritos)
  torneosActivos: [], // slugs
  favoritos: [], // equipo ids
};

// "Mis favoritos" no usa el selector de fecha: siempre muestra una ventana
// fija alrededor de hoy (ultimas y proximas semanas), porque lo util de un
// favorito es ver como le fue la ultima vez y cuando juega la proxima, no
// filtrar dia por dia (decision del usuario, ver CLAUDE.md seccion 13).
//
// La ventana es asimetrica a proposito: hacia atras son resultados ya
// confirmados en la BD (sin riesgo), pero hacia adelante dependemos de que
// las fuentes automaticas (colombia.com para Liga/Copa Betplay) ya tengan el
// partido -- y esa fuente solo cubre de forma confiable unos ~5 dias hacia
// adelante (ver CLAUDE.md seccion 13, 2026-09-02: se probaron 5 APIs/fuentes
// gratuitas distintas para una ventana mas amplia y ninguna funciono dentro
// del presupuesto $0/sin-tarjeta del proyecto). Mostrar "vacio" mas alla de
// esa ventana es mejor que arriesgarse a mostrar un partido con fecha
// incorrecta o quedarnos cortos silenciosamente.
const VENTANA_FAVORITOS_DIAS_ATRAS = 14;
const VENTANA_FAVORITOS_DIAS_ADELANTE = 5;

function bogotaHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function sumarDias(fechaStr, dias) {
  const d = new Date(`${fechaStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatearFechaLarga(fechaStr) {
  const d = new Date(`${fechaStr}T12:00:00`);
  const texto = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function horaAmPm(horaStr) {
  if (!horaStr) return null;
  const [h, m] = horaStr.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

// ---------- Carga inicial de catalogos ----------

async function cargarCatalogos() {
  // torneo-betplay se saco de la app (poca audiencia + comparte la misma
  // fuente sin resolver de Liga/Copa Betplay) -- se filtra aqui en vez de
  // borrar sus filas, para no perder los partidos ya guardados. Ver
  // CLAUDE.md seccion 13.
  const [torneos, equipos] = await Promise.all([
    supabase.get('torneos?select=id,nombre,slug,activo_por_defecto&slug=neq.torneo-betplay&order=nombre.asc'),
    supabase.get('equipos?select=id,nombre,slug&order=nombre.asc'),
  ]);
  state.torneos = torneos;
  state.equipos = equipos;

  const porDefecto = torneos.filter((t) => t.activo_por_defecto).map((t) => t.slug);
  state.torneosActivos = getTorneosActivos(porDefecto);
  state.favoritos = getFavoritos();
}

// ---------- Fetch de partidos ----------

async function cargarPartidos() {
  const campos =
    'id,fecha,hora_local,estado,marcador_local,marcador_visitante,canal,confianza,' +
    'torneo:torneo_id(nombre,slug),' +
    'equipo_local:equipo_local_id(id,nombre),' +
    'equipo_visitante:equipo_visitante_id(id,nombre)';

  let query;

  if (state.vista === 'favoritos') {
    if (state.favoritos.length === 0) return [];
    const hoy = bogotaHoy();
    const desde = sumarDias(hoy, -VENTANA_FAVORITOS_DIAS_ATRAS);
    const hasta = sumarDias(hoy, VENTANA_FAVORITOS_DIAS_ADELANTE);
    const ids = state.favoritos.join(',');
    query =
      `partidos?select=${campos}&fecha=gte.${desde}&fecha=lte.${hasta}` +
      `&order=fecha.asc,hora_local.asc.nullslast` +
      `&or=(equipo_local_id.in.(${ids}),equipo_visitante_id.in.(${ids}))`;
  } else {
    const idsActivos = state.torneos.filter((t) => state.torneosActivos.includes(t.slug)).map((t) => t.id);
    if (idsActivos.length === 0) return [];
    query = `partidos?select=${campos}&fecha=eq.${state.fecha}&order=hora_local.asc.nullslast&torneo_id=in.(${idsActivos.join(',')})`;
  }

  const partidos = await supabase.get(query);
  return aplicarOverrides(partidos);
}

// Fase 7 -- una correccion manual (overrides_manuales) vale por encima de lo
// que diga `partidos`. Se aplica aca, del lado del cliente: la tabla ya es
// publica (RLS de solo lectura, ver CLAUDE.md seccion 7/13), y mantener el
// merge visible en el frontend es mas simple que una vista SQL para este
// volumen de datos.
const CAMPOS_OVERRIDEABLES = new Set(['canal', 'hora_local', 'estado', 'marcador_local', 'marcador_visitante']);

async function aplicarOverrides(partidos) {
  if (partidos.length === 0) return partidos;
  const ids = partidos.map((p) => p.id).join(',');
  const overrides = await supabase.get(`overrides_manuales?select=partido_id,campo,valor&partido_id=in.(${ids})`);
  if (overrides.length === 0) return partidos;

  const porPartido = new Map();
  for (const o of overrides) {
    if (!CAMPOS_OVERRIDEABLES.has(o.campo)) continue;
    if (!porPartido.has(o.partido_id)) porPartido.set(o.partido_id, {});
    porPartido.get(o.partido_id)[o.campo] = o.valor;
  }

  return partidos.map((p) => {
    const cambios = porPartido.get(p.id);
    if (!cambios) return p;
    const corregido = { ...p, ...cambios, _corregido: true };
    if ('marcador_local' in cambios) corregido.marcador_local = Number(cambios.marcador_local);
    if ('marcador_visitante' in cambios) corregido.marcador_visitante = Number(cambios.marcador_visitante);
    return corregido;
  });
}

function agruparPorTorneo(partidos) {
  const grupos = new Map();
  for (const p of partidos) {
    const key = p.torneo.nombre;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  }
  return grupos;
}

function agruparPorFecha(partidos) {
  const grupos = new Map(); // ya vienen ordenados por fecha desde la consulta
  for (const p of partidos) {
    if (!grupos.has(p.fecha)) grupos.set(p.fecha, []);
    grupos.get(p.fecha).push(p);
  }
  return grupos;
}

function etiquetaFecha(fechaStr) {
  const hoy = bogotaHoy();
  if (fechaStr === hoy) return 'Hoy';
  if (fechaStr === sumarDias(hoy, -1)) return 'Ayer';
  if (fechaStr === sumarDias(hoy, 1)) return 'Mañana';
  return formatearFechaLarga(fechaStr);
}

// ---------- Render ----------

function esFavorito(equipoId) {
  return state.favoritos.includes(equipoId);
}

function renderEquipo(equipo) {
  const fav = esFavorito(equipo.id) ? '<span class="estrella" title="Favorito">&#9733;</span>' : '';
  return `<span class="equipo">${fav}${escapeHtml(equipo.nombre)}</span>`;
}

function renderPartidoCard(p, { mostrarTorneo = false } = {}) {
  const centro =
    p.estado === 'finalizado'
      ? `<div class="marcador"><span>${p.marcador_local ?? '-'}</span><span class="separador">-</span><span>${p.marcador_visitante ?? '-'}</span></div>`
      : p.estado === 'pospuesto'
        ? `<div class="estado-pospuesto">Pospuesto</div>`
        : `<div class="hora">${p.hora_local ? horaAmPm(p.hora_local) : 'Por confirmar'}</div>`;

  const canal = p.canal
    ? `<span class="canal">${escapeHtml(p.canal)}</span>`
    : `<span class="canal canal-vacio">Canal por confirmar</span>`;

  // Indicador sutil para datos sin confirmar entre dos fuentes independientes
  // (CLAUDE.md seccion 7). Un dato corregido a mano (override) se considera
  // confiable sin importar el campo `confianza` original.
  const sinConfirmar =
    !p._corregido && p.confianza === 'sin_confirmar'
      ? '<span class="marca-sin-confirmar" title="Dato sin confirmar por una segunda fuente">&#9679;</span>'
      : '';

  const torneoTag = mostrarTorneo ? `<div class="partido-torneo-tag">${escapeHtml(p.torneo.nombre)}</div>` : '';

  return `
    <li class="partido">
      ${torneoTag}
      <div class="partido-equipos">
        ${renderEquipo(p.equipo_local)}
        ${centro}
        ${renderEquipo(p.equipo_visitante)}
      </div>
      <div class="partido-canal">${canal}${sinConfirmar}</div>
    </li>`;
}

function renderTorneoSeccion(nombreTorneo, partidos) {
  return `
    <section class="torneo-seccion">
      <h2 class="torneo-titulo">${escapeHtml(nombreTorneo)}</h2>
      <ul class="partidos-lista">
        ${partidos.map((p) => renderPartidoCard(p)).join('')}
      </ul>
    </section>`;
}

function renderFechaSeccion(fechaStr, partidos) {
  return `
    <section class="torneo-seccion">
      <h2 class="torneo-titulo${fechaStr === bogotaHoy() ? ' torneo-titulo-hoy' : ''}">${etiquetaFecha(fechaStr)}</h2>
      <ul class="partidos-lista">
        ${partidos.map((p) => renderPartidoCard(p, { mostrarTorneo: true })).join('')}
      </ul>
    </section>`;
}

function renderEstadoVacio() {
  const mensaje =
    state.vista === 'favoritos'
      ? state.favoritos.length === 0
        ? 'Todavia no marcaste equipos favoritos. Abre los ajustes para elegir alguno.'
        : `Tus equipos favoritos no tienen partidos en los ultimos ${VENTANA_FAVORITOS_DIAS_ATRAS} dias ni en los proximos ${VENTANA_FAVORITOS_DIAS_ADELANTE}.`
      : state.torneosActivos.length === 0
        ? 'No tienes torneos activos. Abre los ajustes para activar alguno.'
        : 'No hay partidos programados para este dia.';
  return `<p class="estado-vacio">${mensaje}</p>`;
}

async function renderPartidos() {
  const contenedor = $('#partidos-contenedor');
  contenedor.innerHTML = '<p class="cargando">Cargando partidos&hellip;</p>';
  try {
    const partidos = await cargarPartidos();
    if (partidos.length === 0) {
      contenedor.innerHTML = renderEstadoVacio();
      return;
    }
    if (state.vista === 'favoritos') {
      const grupos = agruparPorFecha(partidos);
      contenedor.innerHTML = [...grupos.entries()].map(([fecha, ps]) => renderFechaSeccion(fecha, ps)).join('');
    } else {
      const grupos = agruparPorTorneo(partidos);
      contenedor.innerHTML = [...grupos.entries()].map(([nombre, ps]) => renderTorneoSeccion(nombre, ps)).join('');
    }
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `<p class="estado-error">No se pudo cargar la informacion. Intenta de nuevo en un momento.</p>`;
  }
}

function renderFecha() {
  $('#fecha-actual').textContent = formatearFechaLarga(state.fecha);
  $('#fecha-input').value = state.fecha;
}

// ---------- Panel de ajustes ----------

function renderTorneosChecklist() {
  $('#torneos-checklist').innerHTML = state.torneos
    .map(
      (t) => `
      <label class="checklist-item">
        <input type="checkbox" data-slug="${t.slug}" ${state.torneosActivos.includes(t.slug) ? 'checked' : ''} />
        <span>${escapeHtml(t.nombre)}</span>
      </label>`
    )
    .join('');
}

function renderFavoritosChips() {
  const cont = $('#favoritos-chips');
  if (state.favoritos.length === 0) {
    cont.innerHTML = '<p class="ayuda-vacio">Ningun equipo favorito todavia.</p>';
    return;
  }
  cont.innerHTML = state.favoritos
    .map((id) => {
      const eq = state.equipos.find((e) => e.id === id);
      if (!eq) return '';
      return `<button class="chip" data-id="${id}">${escapeHtml(eq.nombre)} &times;</button>`;
    })
    .join('');
}

function renderResultadosBusqueda(texto) {
  const cont = $('#busqueda-resultados');
  if (!texto.trim()) {
    cont.innerHTML = '';
    return;
  }
  const t = normalizar(texto);
  const resultados = state.equipos
    .filter((e) => normalizar(e.nombre).includes(t) && !state.favoritos.includes(e.id))
    .slice(0, 8);
  cont.innerHTML = resultados
    .map((e) => `<button class="resultado-busqueda" data-id="${e.id}">${escapeHtml(e.nombre)}</button>`)
    .join('');
}

function normalizar(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Eventos ----------

function initEventos() {
  $('#btn-dia-anterior').addEventListener('click', () => {
    state.fecha = sumarDias(state.fecha, -1);
    renderFecha();
    renderPartidos();
  });
  $('#btn-dia-siguiente').addEventListener('click', () => {
    state.fecha = sumarDias(state.fecha, 1);
    renderFecha();
    renderPartidos();
  });
  $('#btn-hoy').addEventListener('click', () => {
    state.fecha = bogotaHoy();
    renderFecha();
    renderPartidos();
  });
  $('#fecha-actual').addEventListener('click', () => {
    const input = $('#fecha-input');
    if (input.showPicker) input.showPicker();
    else input.focus();
  });
  $('#fecha-input').addEventListener('change', (e) => {
    if (e.target.value) {
      state.fecha = e.target.value;
      renderFecha();
      renderPartidos();
    }
  });

  $$('.tab-vista').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.vista = btn.dataset.vista;
      $$('.tab-vista').forEach((b) => b.classList.toggle('activo', b === btn));
      // el selector de fecha no aplica a favoritos: siempre es la ventana
      // asimetrica alrededor de hoy (ver arriba).
      $('.selector-fecha').classList.toggle('oculto', state.vista === 'favoritos');
      renderPartidos();
    })
  );

  const abrirAjustes = () => {
    $('#panel-ajustes').classList.add('abierto');
    $('#overlay-ajustes').classList.add('mostrar');
  };
  const cerrarAjustes = () => {
    $('#panel-ajustes').classList.remove('abierto');
    $('#overlay-ajustes').classList.remove('mostrar');
  };
  $('#btn-ajustes').addEventListener('click', abrirAjustes);
  $('#btn-cerrar-ajustes').addEventListener('click', cerrarAjustes);
  $('#overlay-ajustes').addEventListener('click', cerrarAjustes);

  $('#torneos-checklist').addEventListener('change', (e) => {
    const input = e.target.closest('input[data-slug]');
    if (!input) return;
    const slug = input.dataset.slug;
    state.torneosActivos = input.checked
      ? [...state.torneosActivos, slug]
      : state.torneosActivos.filter((s) => s !== slug);
    setTorneosActivos(state.torneosActivos);
    if (state.vista === 'todos') renderPartidos();
  });

  $('#busqueda-equipo').addEventListener('input', (e) => renderResultadosBusqueda(e.target.value));

  $('#busqueda-resultados').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    state.favoritos = [...state.favoritos, id];
    setFavoritos(state.favoritos);
    $('#busqueda-equipo').value = '';
    renderResultadosBusqueda('');
    renderFavoritosChips();
    if (state.vista === 'favoritos') renderPartidos();
  });

  $('#favoritos-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    state.favoritos = state.favoritos.filter((f) => f !== id);
    setFavoritos(state.favoritos);
    renderFavoritosChips();
    if (state.vista === 'favoritos') renderPartidos();
  });
}

// ---------- Arranque ----------

async function main() {
  initEventos();
  renderFecha();
  try {
    await cargarCatalogos();
  } catch (err) {
    console.error(err);
    $('#partidos-contenedor').innerHTML = `<p class="estado-error">No se pudo conectar con la base de datos.</p>`;
    return;
  }
  renderTorneosChecklist();
  renderFavoritosChips();
  renderPartidos();
}

main();
