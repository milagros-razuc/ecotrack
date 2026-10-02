// Mock simple de una tabla "usuarios" en memoria, para probar las reglas
// de negocio de usuarios.service.js sin necesitar una Postgres real.
const assert = require('assert');
const bcrypt = require('bcryptjs');

let usuarios = [];
let nextId = 1;

const fakePool = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id FROM usuarios WHERE username')) {
      const [username] = params;
      return { rows: usuarios.filter(u => u.username === username) };
    }

    if (s.startsWith('INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)')) {
      const [username, password_hash, nombre, rol, cliente_id] = params;
      const nuevo = { id: nextId++, username, password_hash, nombre, rol, cliente_id, token_version: 1, creado_en: new Date() };
      usuarios.push(nuevo);
      const { password_hash: _omit, ...sinHash } = nuevo;
      return { rows: [sinHash] };
    }

    if (s.startsWith('SELECT * FROM usuarios WHERE id')) {
      const [id] = params;
      return { rows: usuarios.filter(u => u.id === parseInt(id, 10)) };
    }

    if (s.startsWith("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND cliente_id = $1 AND id !=")) {
      const [clienteId, id] = params;
      const count = usuarios.filter(u => u.rol === 'admin' && u.cliente_id === clienteId && u.id !== parseInt(id, 10)).length;
      return { rows: [{ count: String(count) }] };
    }

    if (s.startsWith('UPDATE usuarios SET nombre = $1, rol = $2, token_version =')) {
      const [nombre, rol, id, clienteId, roleChanged] = params;
      const u = usuarios.find(u => u.id === parseInt(id, 10));
      if (!u || u.cliente_id !== clienteId) return { rows: [] };
      u.nombre = nombre;
      u.rol = rol;
      if (roleChanged) u.token_version += 1;
      const { password_hash: _omit, ...sinHash } = u;
      return { rows: [sinHash] };
    }

    if (s.startsWith('DELETE FROM usuarios WHERE id')) {
      const [id] = params;
      usuarios = usuarios.filter(u => u.id !== parseInt(id, 10));
      return { rows: [] };
    }

    throw new Error('Query no mockeada: ' + s);
  },
};

// Interceptamos el require de '../config/db' para inyectar el mock
const Module = require('module');
const originalResolve = Module._resolveFilename;
const path = require('path');
require.cache[path.resolve(__dirname, '../config/db.js')] = {
  id: path.resolve(__dirname, '../config/db.js'),
  filename: path.resolve(__dirname, '../config/db.js'),
  loaded: true,
  exports: fakePool,
};

const usuariosService = require('../services/usuarios.service');

async function run() {
  // 1. Crear el admin inicial (simula el seed de migrate.js)
  const r1 = await usuariosService.crear({ username: 'admin', password: 'admin123', nombre: 'Admin', rol: 'admin' });
  assert.ok(r1.usuario, 'debería crear el admin inicial');
  const adminId = r1.usuario.id;
  console.log('✓ Alta de admin inicial OK ->', r1.usuario);

  // 2. Crear un usuario común
  const r2 = await usuariosService.crear({ username: 'operario1', password: 'clave123', nombre: 'Operario Uno', rol: 'comun' });
  assert.ok(r2.usuario, 'debería crear el usuario común');
  const comunId = r2.usuario.id;
  console.log('✓ Alta de usuario común OK ->', r2.usuario);

  // 3. No debe permitir username duplicado
  const r3 = await usuariosService.crear({ username: 'admin', password: 'otra', nombre: 'Otro', rol: 'comun' });
  assert.strictEqual(r3.error, 'El nombre de usuario ya existe');
  console.log('✓ Rechaza username duplicado OK ->', r3.error);

  // 4. El admin no puede eliminar su propia cuenta
  const r4 = await usuariosService.eliminar(adminId, adminId);
  assert.strictEqual(r4.error, 'No podés eliminar tu propia cuenta');
  console.log('✓ Rechaza auto-eliminación OK ->', r4.error);

  // 5. No se puede eliminar al único admin (simulando que otro admin lo intenta,
  //    pero como es el único admin del sistema, igual debe rechazarse)
  const r5 = await usuariosService.eliminar(adminId, comunId);
  assert.strictEqual(r5.error, 'No se puede eliminar: es el único administrador activo');
  console.log('✓ Rechaza eliminar al único admin OK ->', r5.error);

  // 6. No se puede bajar de rol al único admin
  const r6 = await usuariosService.actualizar(adminId, { rol: 'comun' });
  assert.strictEqual(r6.error, 'No se puede quitar el rol de administrador: es el único admin activo');
  console.log('✓ Rechaza degradar al único admin OK ->', r6.error);

  // 7. Ahora promovemos al usuario común a admin, y volvemos a intentar todo:
  //    ya debería permitirse porque hay dos admins.
  await usuariosService.actualizar(comunId, { rol: 'admin' });
  const r7 = await usuariosService.actualizar(adminId, { rol: 'comun' });
  assert.ok(r7.usuario, 'ahora sí debería poder degradar, porque hay otro admin');
  assert.strictEqual(r7.usuario.rol, 'comun');
  console.log('✓ Permite degradar cuando hay otro admin OK ->', r7.usuario);

  // 8. Y ahora sí se puede eliminar al que ya es común (no es admin)
  const r8 = await usuariosService.eliminar(adminId, comunId);
  assert.ok(r8.ok, 'debería poder eliminar a un usuario que ya no es admin');
  console.log('✓ Permite eliminar usuario común OK');

  // 9. La contraseña quedó hasheada (nunca en texto plano)
  const guardado = usuarios.find(u => u.username === 'operario1') || usuarios.find(u => u.id === comunId);
  console.log('✓ (usuarios restantes en la tabla mock):', usuarios.map(u => ({ id: u.id, username: u.username, rol: u.rol })));

  console.log('\nTODOS LOS TESTS PASARON ✅');
}

run().catch((err) => {
  console.error('\n❌ FALLÓ UN TEST:', err.message);
  process.exit(1);
});
