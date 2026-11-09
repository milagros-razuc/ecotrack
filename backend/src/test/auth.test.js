const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { Pool } = require('pg');
const { withTemporaryMigrationDatabase } = require('./platform-panel.test-support');

process.env.JWT_SECRET = 'unit-test-secret';
const dbPath = path.resolve(__dirname, '../config/db.js');
const authServicePath = path.resolve(__dirname, '../services/auth.service.js');
const authMiddlewarePath = path.resolve(__dirname, '../middleware/auth.js');
const passwordHash = bcrypt.hashSync('correcta-123', 10);
const user = {
  id: 7,
  username: 'admin-a',
  password_hash: passwordHash,
  nombre: 'Admin A',
  rol: 'admin',
  cliente_id: 10,
  token_version: 3,
  must_change_password: false,
};
const queries = [];
let missingColumnError = false;

const fakePool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (missingColumnError && sql.includes('must_change_password')) {
      const error = new Error('column must_change_password does not exist');
      error.code = '42703';
      throw error;
    }
    if (sql.includes('SELECT * FROM usuarios WHERE username')) {
      return { rows: params[0] === user.username ? [user] : [] };
    }
    if (sql.includes('SELECT * FROM usuarios WHERE id')) return { rows: [user] };
    if (sql.includes('SELECT id, username, nombre, rol, creado_en')) {
      return { rows: [{ id: user.id, username: user.username, nombre: user.nombre, rol: user.rol }] };
    }
    if (sql.includes('UPDATE usuarios') && sql.includes('password_hash')) {
      user.password_hash = params[0];
      user.token_version += 1;
      return { rows: [{ token_version: user.token_version, username: user.username, rol: user.rol, cliente_id: user.cliente_id }] };
    }
    if (sql.includes('UPDATE usuarios SET nombre')) {
      user.nombre = params[0];
      return { rows: [{ id: user.id, username: user.username, nombre: user.nombre, rol: user.rol }] };
    }
    if (sql.includes('SELECT token_version') && sql.includes('FROM usuarios')) {
      return { rows: [{ token_version: user.token_version, must_change_password: user.must_change_password }] };
    }
    if (sql.includes('SELECT must_change_password FROM usuarios')) {
      return { rows: [{ must_change_password: user.must_change_password }] };
    }
    throw new Error(`Query no mockeada: ${sql}`);
  },
};

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };
delete require.cache[authServicePath];
delete require.cache[authMiddlewarePath];
const authService = require('../services/auth.service');
const authMiddleware = require('../middleware/auth');

test('CP-RF20 login correcto emite JWT con cliente, rol y token_version', async () => {
  const result = await authService.login('admin-a', 'correcta-123');
  const payload = jwt.verify(result.token, process.env.JWT_SECRET);

  assert.equal(payload.clienteId, 10);
  assert.equal(payload.rol, 'admin');
  assert.equal(payload.tv, 3);
  assert.equal(result.username, 'admin-a');
  assert.equal(result.password_hash, undefined);
});

test('CP-RF20 login inexistente y contraseña errónea devuelven exactamente el mismo error', async () => {
  const missing = await authService.login('no-existe', 'incorrecta');
  const wrong = await authService.login('admin-a', 'incorrecta');

  assert.deepEqual(missing, wrong);
  assert.deepEqual(missing, { error: 'Usuario o contraseña incorrectos' });
});

test('CP-RF20 PATCH me actualiza perfil sin devolver contraseña ni permitir cambio de rol', async () => {
  const result = await authService.actualizarPerfil(7, { nombre: 'Nombre actualizado' });

  assert.equal(result.nombre, 'Nombre actualizado');
  assert.equal(result.rol, 'admin');
  assert.equal(result.password_hash, undefined);
  assert.equal(queries.some(({ sql }) => sql.includes('SET rol')), false);
});

test('CP-RF20 cambio de contraseña exige la actual y devuelve hash nuevo solo indirectamente mediante token', async () => {
  const beforeVersion = user.token_version;
  const result = await authService.cambiarPassword(7, 'correcta-123', 'nueva-123');
  const payload = jwt.verify(result.token, process.env.JWT_SECRET);

  assert.equal(result.ok, true);
  assert.equal(payload.tv, beforeVersion + 1);
  assert.equal(await bcrypt.compare('nueva-123', user.password_hash), true);
  assert.equal(user.password_hash.includes('nueva-123'), false);
});

test('CP-RF20 cambio de contraseña rechaza contraseña actual incorrecta', async () => {
  const result = await authService.cambiarPassword(7, 'anterior-incorrecta', 'otra-123');
  assert.deepEqual(result, { error: 'La contraseña actual es incorrecta' });
});

test('CP-RF20 token previo al cambio queda invalidado por token_version', async () => {
  const oldToken = jwt.sign({
    sub: 7,
    username: user.username,
    rol: user.rol,
    clienteId: user.cliente_id,
    tv: user.token_version - 1,
  }, process.env.JWT_SECRET);
  await assert.rejects(() => authMiddleware.validarToken(oldToken), { code: 'SESSION_INVALIDATED' });
});

test('CP-RF18 token sin clienteId se conserva para que extraerCliente lo rechace', async () => {
  const token = jwt.sign({ sub: 7, username: user.username, rol: user.rol, tv: user.token_version }, process.env.JWT_SECRET);
  const payload = await authMiddleware.validarToken(token);
  assert.equal(payload.clienteId, undefined);

  const extraerCliente = require('../middleware/cliente');
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  extraerCliente({ usuario: payload }, response, () => {
    throw new Error('un token sin cliente no puede continuar');
  });
  assert.equal(response.statusCode, 401);
});

test('Feature 021 validarToken consulta el estado de contraseña en una sola consulta', async () => {
  queries.length = 0;
  const token = jwt.sign({
    sub: user.id,
    username: user.username,
    rol: user.rol,
    clienteId: user.cliente_id,
    tv: user.token_version,
  }, process.env.JWT_SECRET);

  const payload = await authMiddleware.validarToken(token);

  assert.equal(payload.mustChangePassword, false);
  assert.equal(queries.length, 1);
});

test('Feature 021 un error de columna ausente no desactiva el bloqueo', async () => {
  missingColumnError = true;
  const token = jwt.sign({
    sub: user.id,
    username: user.username,
    rol: user.rol,
    clienteId: user.cliente_id,
    tv: user.token_version,
  }, process.env.JWT_SECRET);

  await assert.rejects(() => authMiddleware.validarToken(token), { code: 'INVALID_TOKEN' });
  missingColumnError = false;
});

test('Feature 021 auth usa PostgreSQL real para restringir el primer login y completarlo', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString }) => {
    const url = new URL(connectionString);
    const databaseConfig = {
      host: url.hostname,
      port: url.port,
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
    const realPool = new Pool(databaseConfig);
    const temporaryPassword = 'Temporal-Password-123';
    const username = 'pending-feature-021';
    try {
      await realPool.query(fs.readFileSync(
        path.resolve(__dirname, '../../migrations/020_client_admin.sql'),
        'utf8',
      ));
      const hash = await bcrypt.hash(temporaryPassword, 10);
      const { rows } = await realPool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id, must_change_password)
         VALUES ($1, $2, 'Pending User', 'admin', 1, true)
         RETURNING id`,
        [username, hash],
      );
      const userId = rows[0].id;

      process.env.DB_HOST = databaseConfig.host;
      process.env.DB_PORT = databaseConfig.port;
      process.env.DB_NAME = databaseConfig.database;
      process.env.DB_USER = databaseConfig.user;
      process.env.DB_PASS = databaseConfig.password;

      delete require.cache[dbPath];
      delete require.cache[authServicePath];
      const realAuthService = require('../services/auth.service');

      const login = await realAuthService.login(username, temporaryPassword);
      assert.equal(login.mustChangePassword, true);
      assert.equal((await realAuthService.obtenerPorId(userId)).must_change_password, true);

      const samePassword = await realAuthService.cambiarPassword(
        userId,
        temporaryPassword,
        temporaryPassword,
      );
      assert.deepEqual(samePassword, { error: 'La nueva contraseña no puede ser igual a la temporal' });

      const changed = await realAuthService.cambiarPassword(userId, temporaryPassword, 'Nueva-Segura-456');
      assert.equal(changed.ok, true);
      const { rows: state } = await realPool.query(
        'SELECT must_change_password, token_version FROM usuarios WHERE id = $1',
        [userId],
      );
      assert.equal(state[0].must_change_password, false);
      assert.equal(state[0].token_version, 2);

    } finally {
      await realPool.end();
      await require(dbPath).end();
      require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };
      delete require.cache[authServicePath];
      delete require.cache[authMiddlewarePath];
    }
  });
});
