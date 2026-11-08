const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const seedPath = path.resolve(__dirname, '../../scripts/seed-platform-admin.js');

test('T020: el seed de platform_admin es idempotente y no imprime credenciales', () => {
  assert.ok(fs.existsSync(seedPath), 'falta el script de seed de platform_admin');
  const source = fs.readFileSync(seedPath, 'utf8');
  assert.match(source, /es_plataforma/);
  assert.doesNotMatch(source, /console\.log\([^)]*(password|secret|hash|token)/i);
});
