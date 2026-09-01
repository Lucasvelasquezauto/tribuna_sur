import { pathToFileURL } from 'node:url';

/** true si el modulo se ejecuto directamente (`node archivo.js`), no via import. */
export function esEjecucionDirecta(moduleUrl) {
  return moduleUrl === pathToFileURL(process.argv[1]).href;
}
