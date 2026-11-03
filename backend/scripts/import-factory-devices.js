#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const poolPorDefecto = require('../src/config/db');

const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const DEVICE_ID_PATTERN = /^[^\s]{1,50}$/;
const REQUIRED_HEADERS = ['device_id', 'factory_secret_hash'];
const OPTIONAL_CREATED_AT = 'created_at';

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV inválido: comillas sin cerrar');
  fields.push(field);
  return fields;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('CSV vacío');

  const headers = parseCsvLine(lines[0]);
  const hasCreatedAt = headers.length === 3 && headers[2] === OPTIONAL_CREATED_AT;
  const validHeaders = headers.length === 2
    && headers.every((header, index) => header === REQUIRED_HEADERS[index]);
  if (!validHeaders && !(
    hasCreatedAt
    && headers[0] === REQUIRED_HEADERS[0]
    && headers[1] === REQUIRED_HEADERS[1]
  )) {
    throw new Error('Encabezados CSV inválidos');
  }

  return lines.slice(1).map((line, index) => {
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) {
      throw new Error(`Fila CSV inválida en línea ${index + 2}`);
    }
    const [deviceId, factorySecretHash, createdAt] = fields;
    if (!DEVICE_ID_PATTERN.test(deviceId) || !HASH_PATTERN.test(factorySecretHash)) {
      throw new Error(`Fila CSV inválida en línea ${index + 2}`);
    }
    if (hasCreatedAt && Number.isNaN(Date.parse(createdAt))) {
      throw new Error(`Fila CSV inválida en línea ${index + 2}`);
    }
    return { deviceId, factorySecretHash, createdAt: hasCreatedAt ? createdAt : null };
  });
}

function findRepositoryRoot(scriptDir) {
  let current = path.resolve(scriptDir);
  while (true) {
    if (fsSync.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function getForbiddenRoots(scriptDir = __dirname) {
  const backendRoot = path.resolve(scriptDir, '..');
  const repositoryRoot = findRepositoryRoot(scriptDir);
  return repositoryRoot && repositoryRoot !== backendRoot
    ? [backendRoot, repositoryRoot]
    : [backendRoot];
}

function isWithinRoot(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function assertOutsideRepository(csvPath, { scriptDir = __dirname } = {}) {
  const absolutePath = path.resolve(csvPath);
  if (getForbiddenRoots(scriptDir).some((root) => isWithinRoot(absolutePath, root))) {
    throw new Error('La ruta CSV debe estar fuera del repositorio');
  }
  return absolutePath;
}

async function importFactoryDevices({ csvPath, pool = poolPorDefecto, scriptDir = __dirname }) {
  const absolutePath = assertOutsideRepository(csvPath, { scriptDir });
  const canonicalPath = await fs.realpath(absolutePath);
  assertOutsideRepository(canonicalPath, { scriptDir });
  const content = await fs.readFile(canonicalPath, 'utf8');
  const rows = parseCsv(content);
  const client = await pool.connect();
  let inserted = 0;
  let omitted = 0;

  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const result = await client.query(
        `INSERT INTO dispositivos_fabrica (device_id, factory_secret_hash, created_at)
         VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))
         ON CONFLICT DO NOTHING`,
        [row.deviceId, row.factorySecretHash, row.createdAt],
      );
      if (result.rowCount === 1) inserted += 1;
      else omitted += 1;
    }
    await client.query('COMMIT');
    return { inserted, omitted };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1) {
    throw new Error('Uso: node scripts/import-factory-devices.js <ruta-csv-fuera-del-repo>');
  }
  const result = await importFactoryDevices({ csvPath: args[0] });
  console.log(`Dispositivos de fábrica: ${result.inserted} insertados, ${result.omitted} omitidos`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`Error al importar dispositivos de fábrica: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await poolPorDefecto.end();
    });
}

module.exports = {
  assertOutsideRepository,
  findRepositoryRoot,
  getForbiddenRoots,
  isWithinRoot,
  importFactoryDevices,
  main,
  parseCsv,
};
