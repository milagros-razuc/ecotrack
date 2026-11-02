const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const servicePath = path.resolve(__dirname, '../services/usuarios.service.js');
const users = [
  { id: 1, username: 'admin-a', password_hash: 'hash-a', nombre: 'Admin A', rol: 'admin', cliente_id: 10, token_version: 1 },
  { id: 2, username: 'comun-a', password_hash: 'hash-c', nombre: 'Comun A', rol: 'comun', cliente_id: 10, token_version: 1 },
  { id: 3, username: 'admin-b', password_hash: 'hash-b', nombre: 'Admin B', rol: 'admin', cliente_id: 20, token_version: 1 },
];
const queries = [];

function publicUser(user) {
  const { password_hash: passwordHash, ...safeUser } = user;
  return safeUser;
}

const fakePool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    const compact = sql.replace(/\s+/g, ' ').trim();

    if (compact.startsWith('SELECT id FROM usuarios WHERE username')) {
      return { rows: users.filter(user => user.username === params[0]) };
    }
    if (compact.startsWith('INSERT INTO usuarios')) {
      const user = {
        id: Math.max(...users.map(item => item.id)) + 1,
        username: params[0],
        password_hash: params[1],
        nombre: params[2],
        rol: params[3],
        cliente_id: params[4],
        token_version: 1,
      };
      users.push(user);
      return { rows: [publicUser(user)] };
    }
    if (compact.startsWith('SELECT * FROM usuarios WHERE id = $1 AND cliente_id')) {
      return { rows: users.filter(user => user.id === Number(params[0]) && user.cliente_id === params[1]) };
    }
    if (compact.startsWith('SELECT COUNT(*) FROM usuarios')) {
      return {
        rows: [{
          count: String(users.filter(user => user.rol === 'admin'
            && user.cliente_id === params[0]
            && user.id !== Number(params[1])).length),
        }],
      };
    }
    if (compact.startsWith('UPDATE usuarios SET nombre = $1, rol = $2')) {
      const user = users.find(item => item.id === Number(params[2]) && item.cliente_id === params[3]);
      if (!user) return { rows: [] };
      user.nombre = params[0];
      user.rol = params[1];
      return { rows: [publicUser(user)] };
    }
    if (compact.startsWith('DELETE FROM usuarios')) {
      const index = users.findIndex(user => user.id === Number(params[0]) && user.cliente_id === params[1]);
      if (index >= 0) users.splice(index, 1);
      return { rows: [] };
    }
    throw new Error(`Query no mockeada: ${compact}`);
  },
};

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };
delete require.cache[servicePath];
const usuariosService = require('../services/usuarios.service');

test('CP-RF16 crear usuario acotado al cliente y nunca devuelve password_hash', async () => {
  const result = await usuariosService.crear({
    username: 'nuevo-a',
    password: 'secreto-123',
    nombre: 'Nuevo',
    rol: 'comun',
    clienteId: 10,
  });

  assert.ok(result.usuario);
  assert.equal(result.usuario.cliente_id, 10);
  assert.equal('password_hash' in result.usuario, false);
  const stored = users.find(user => user.username === 'nuevo-a');
  assert.ok(await bcrypt.compare('secreto-123', stored.password_hash));
  assert.notEqual(stored.password_hash, 'secreto-123');
});

test('CP-RF16 username duplicado se rechaza sin insertar', async () => {
  const before = users.length;
  const result = await usuariosService.crear({
    username: 'admin-a',
    password: 'otra',
    nombre: 'Otro',
    rol: 'comun',
    clienteId: 20,
  });

  assert.deepEqual(result, { error: 'El nombre de usuario ya existe' });
  assert.equal(users.length, before);
});

test('CP-RF16 editar usuario exige pertenencia al cliente autenticado', async () => {
  const result = await usuariosService.actualizar(3, { nombre: 'No tocar' }, 10);
  assert.deepEqual(result, { error: 'Usuario no encontrado' });
});

test('CP-RF16 eliminar usuario exige pertenencia al cliente autenticado', async () => {
  const result = await usuariosService.eliminar(3, 1, 10);
  assert.deepEqual(result, { error: 'Usuario no encontrado' });
});

test('CP-RF17 no elimina ni degrada al último admin del cliente', async () => {
  const resultDelete = await usuariosService.eliminar(3, 1, 20);
  const resultDemote = await usuariosService.actualizar(3, { rol: 'comun' }, 20);

  assert.equal(resultDelete.error, 'No se puede eliminar: es el único administrador activo');
  assert.equal(resultDemote.error, 'No se puede quitar el rol de administrador: es el único admin activo');
});

test('CP-RF17 permite eliminar o degradar admin cuando existe otro admin del mismo cliente', async () => {
  const secondAdmin = {
    id: 4,
    username: 'admin-a-2',
    password_hash: 'hash',
    nombre: 'Admin A 2',
    rol: 'admin',
    cliente_id: 10,
    token_version: 1,
  };
  users.push(secondAdmin);

  const demoted = await usuariosService.actualizar(1, { rol: 'comun' }, 10);
  assert.equal(demoted.usuario.rol, 'comun');
  const deleted = await usuariosService.eliminar(4, 1, 10);
  assert.deepEqual(deleted, { ok: true });
});

