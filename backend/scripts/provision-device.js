#!/usr/bin/env node

function mostrarAyuda() {
  console.log(`
Uso:
  node scripts/provision-device.js --codigo <codigo>
  node scripts/provision-device.js --rotate <codigo>

Opciones:
  --codigo <codigo>  Aprovisiona un dispositivo nuevo e imprime su token una sola vez.
  --rotate <codigo>  Habilita un nuevo ciclo para un dispositivo sin dueño.
  --help             Muestra esta ayuda.
`);
}

if (process.argv.includes('--help') || process.argv.length <= 2) {
  mostrarAyuda();
}

module.exports = { mostrarAyuda };
