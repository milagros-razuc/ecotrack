const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const test = require('node:test');
const path = require('node:path');

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
};
const queries = [];

const fakePool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT * FROM usuarios WHERE username')) {
      return { rows: params[0] === user.username ? [user] : [] };
    }
    if (sql.includes('SELECT * FROM usuarios WHERE id')) return { rows: [user] };
    if (sql.includes('SELECT id, username, nombre, rol, creado_en')) {
      return { rows: [{ id: user.id, username: user.username, nombre: user.nombre, rol: user.rol }] };
    }
    if (sql.includes('UPDATE usuarios SET password_hash')) {
      user.password_hash = params[0];
      user.token_version += 1;
      return { rows: [{ token_version: user.token_version, username: user.username, rol: user.rol, cliente_id: user.cliente_id }] };
    }
    if (sql.includes('UPDATE usuarios SET nombre')) {
      user.nombre = params[0];
      return { rows: [{ id: user.id, username: user.username, nombre: user.nombre, rol: user.rol }] };
    }
    if (sql.includes('SELECT token_version FROM usuarios')) return { rows: [{ token_version: user.token_version }] };
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
