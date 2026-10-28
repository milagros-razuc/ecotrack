#!/usr/bin/env node

require('dotenv').config();

const pool = require('../src/config/db');
const dispositivosService = require('../src/services/dispositivos.service');

function mostrarAyuda() {
  console.log(`
Uso:
  node scripts/provision-device.js <codigo>
  node scripts/provision-device.js --codigo <codigo>
  node scripts/provision-device.js --rotate <codigo>
`);
}

function parsearArgumentos(args) {
  if (args.length === 1 && args[0] !== '--help') {
    return { operation: 'provision', codigo: args[0] };
  }
  if (args.length === 2 && (args[0] === '--codigo' || args[0] === '--rotate')) {
    return { operation: args[0] === '--rotate' ? 'rotate' : 'provision', codigo: args[1] };
  }
  return null;
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args[0] === '--help') {
    mostrarAyuda();
    return 0;
  }

  const parsed = parsearArgumentos(args);
  if (!parsed || !/^[^\\s]{1,50}$/.test(parsed.codigo)) {
    throw new Error('Uso inválido. Ejecutá --help para ver el formato.');
  }

  const resultado = parsed.operation === 'rotate'
    ? await dispositivosService.rotarToken({ codigo: parsed.codigo })
    : await dispositivosService.provisionar({ codigo: parsed.codigo });

  if (resultado.error) {
    throw new Error(resultado.error);
  }

  console.log(`Token de reclamo: ${resultado.token}`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = { main, parsearArgumentos, mostrarAyuda };
