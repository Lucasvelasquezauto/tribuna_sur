// Fase 7 — crea una correccion manual que el frontend aplica por encima de lo
// que diga `partidos` (ver CLAUDE.md seccion 7). No hay job automatico que
// escriba aca: es una accion manual del dueño del proyecto cuando nota un dato
// mal, tipicamente un cambio de canal de ultima hora (seccion 10).
//
// Uso: node scripts/agregar-override.js <partido_id> <campo> <valor> [motivo]
// Ej:  node scripts/agregar-override.js 42 canal "ESPN 3" "Cambio de ultima hora"

import { upsert } from './lib/supabase.js';

const CAMPOS_VALIDOS = ['canal', 'hora_local', 'estado', 'marcador_local', 'marcador_visitante'];

async function main() {
  const [partidoId, campo, valor, motivo] = process.argv.slice(2);
  if (!partidoId || !campo || !valor) {
    console.error('Uso: node scripts/agregar-override.js <partido_id> <campo> <valor> [motivo]');
    console.error(`Campos validos: ${CAMPOS_VALIDOS.join(', ')}`);
    process.exit(1);
  }
  if (!CAMPOS_VALIDOS.includes(campo)) {
    throw new Error(`Campo "${campo}" no soportado. Validos: ${CAMPOS_VALIDOS.join(', ')}`);
  }

  const [fila] = await upsert(
    'overrides_manuales',
    [{ partido_id: Number(partidoId), campo, valor, motivo: motivo || null }],
    'id'
  );
  console.log(`[agregar-override] creado: partido ${partidoId}, ${campo} = "${valor}"`, motivo ? `(${motivo})` : '');
  return fila;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
