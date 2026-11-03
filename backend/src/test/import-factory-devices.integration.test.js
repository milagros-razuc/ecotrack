const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const test = require('node:test');

const {
  withTemporaryDatabase,
} = require('./realtime.test-support');
const {
  assertOutsideRepository,
  getForbiddenRoots,
  importFactoryDevices,
} = require('../../scripts/import-factory-devices');

function csvFile(name) {
  return path.join(os.tmpdir(), `ecotrack-${name}-${Date.now()}.csv`);
}

test('acepta un CSV temporal y rechaza backend y raíz del repositorio', async () => {
  const temporaryCsv = csvFile('accepted');
  await fs.writeFile(temporaryCsv, 'device_id,factory_secret_hash\n');
  try {
    assertOutsideRepository(temporaryCsv);
    assert.throws(
      () => assertOutsideRepository(path.join(__dirname, '..', '..', 'scripts', 'file.csv')),
      /fuera del repositorio/,
    );
    assert.throws(
      () => assertOutsideRepository(path.resolve(__dirname, '..', '..', '..', 'README.MD')),
      /fuera del repositorio/,
    );
  } finally {
    await fs.rm(temporaryCsv, { force: true });
  }
});

test('acepta /tmp equivalente cuando el script corre bajo /app/scripts', async () => {
  const layoutRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ecotrack-container-'));
  const scriptDir = path.join(layoutRoot, 'app', 'scripts');
  const csvPath = path.join(layoutRoot, 'tmp', 'backend.csv');
  await fs.mkdir(scriptDir, { recursive: true });
  await fs.mkdir(path.dirname(csvPath), { recursive: true });
  try {
    assert.deepEqual(getForbiddenRoots(scriptDir), [path.join(layoutRoot, 'app')]);
    assertOutsideRepository(csvPath, { scriptDir });
  } finally {
    await fs.rm(layoutRoot, { recursive: true, force: true });
  }
});

async function createFactoryTable(pool) {
  await pool.query(`
    CREATE TABLE dispositivos_fabrica (
      device_id VARCHAR(50) PRIMARY KEY,
      factory_secret_hash VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enrolled_at TIMESTAMPTZ
    )
  `);
}

test('importa backend.csv y omite filas ya existentes en una base descartable', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para usar una base PostgreSQL descartable');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    const pool = new Pool(database);
    const csvPath = csvFile('valid');
    const hashA = 'a'.repeat(64);
    const hashB = 'b'.repeat(64);
    await createFactoryTable(pool);
    await pool.query(
      'INSERT INTO dispositivos_fabrica (device_id, factory_secret_hash) VALUES ($1, $2)',
      ['DEVICE-EXISTING', 'c'.repeat(64)],
    );
    await fs.writeFile(csvPath, [
      'device_id,factory_secret_hash',
      `DEVICE-EXISTING,${hashA}`,
      `DEVICE-NEW,${hashB}`,
    ].join('\n'));

    try {
      const result = await importFactoryDevices({ csvPath, pool });
      assert.deepEqual(result, { inserted: 1, omitted: 1 });
      const { rows } = await pool.query(
        'SELECT device_id FROM dispositivos_fabrica ORDER BY device_id',
      );
      assert.deepEqual(rows.map((row) => row.device_id), ['DEVICE-EXISTING', 'DEVICE-NEW']);
    } finally {
      await fs.rm(csvPath, { force: true });
      await pool.end();
    }
  });
});

test('rechaza una fila inválida sin insertar ninguna fila', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para usar una base PostgreSQL descartable');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    const pool = new Pool(database);
    const csvPath = csvFile('invalid');
    await createFactoryTable(pool);
    await fs.writeFile(csvPath, [
      'device_id,factory_secret_hash',
      `DEVICE-VALID,${'d'.repeat(64)}`,
      'DEVICE-INVALID,not-a-hash',
    ].join('\n'));

    try {
      await assert.rejects(importFactoryDevices({ csvPath, pool }), /Fila CSV inválida/);
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM dispositivos_fabrica');
      assert.equal(rows[0].count, 0);
    } finally {
      await fs.rm(csvPath, { force: true });
      await pool.end();
    }
  });
});
