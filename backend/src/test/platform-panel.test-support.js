const assert = require('node:assert/strict');

function requireTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL es obligatorio');
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(database, /(?:hardening_.*|.*_test)$/, 'La base debe ser de pruebas');
  return { connectionString, url, database };
}

function assertBaseline(actual) {
  assert.equal(actual.passed, 76);
  assert.equal(actual.total, 77);
  assert.equal(actual.knownFailure, 'subtest 13');
}

module.exports = { requireTestDatabase, assertBaseline };
