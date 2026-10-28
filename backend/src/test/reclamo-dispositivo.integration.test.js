const assert = require('assert');
const test = require('node:test');
const { withTemporaryDatabase } = require('./realtime.test-support');

test('fixture de reclamo usa una base temporal aislada', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    assert.match(database.database, /^hardening_|_test$/);
  });
});
