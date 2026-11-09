require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { z } = require('zod');

const BCRYPT_COST = 10;
const RESERVED_USERNAMES = new Set(['platform_admin', 'plataforma', 'root']);

const inputSchema = z.object({
  clienteId: z.number().int().positive().optional(),
  clienteNombre: z.string().min(1).optional(),
  username: z.string().trim().toLowerCase().min(3).max(50),
  nombreAdmin: z.string().trim().min(1),
  motivo: z.string().trim().min(3).max(200),
  password: z.string({ required_error: 'La contraseña es obligatoria (variable ECOTRACK_ADMIN_PASSWORD)' })
  .min(12, 'La contraseña debe tener al menos 12 caracteres'),
  pool: z.any().optional(),
  auditWriter: z.any().optional(),
}).strict().superRefine((input, context) => {
  if ((input.clienteId === undefined) === (input.clienteNombre === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clienteId'],
      message: 'Debe indicar exactamente uno de clienteId o clienteNombre',
    });
  }
  if (RESERVED_USERNAMES.has(input.username)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['username'],
      message: 'El username está reservado',
    });
  }
});

function validationError(error) {
  if (!(error instanceof z.ZodError)) return error;
  const message = error.issues.map((issue) => issue.message).join('; ');
  return new Error(`Entrada inválida: ${message}`);
}

async function writeAudit(client, { clienteId, usuarioId, username, motivo }) {
  await client.query(
    `INSERT INTO auditoria
       (cliente_id, usuario_id, usuario_username, actor_tipo, accion, entidad, entidad_id, detalle)
     VALUES ($1, NULL, NULL, 'platform_admin', 'crear_admin_cliente', 'usuario', $2, $3)`,
    [
      clienteId,
      String(usuarioId),
      JSON.stringify({ username, cliente_id: clienteId, motivo }),
    ],
  );
}

async function crearAdminCliente(rawInput) {
  let input;
  try {
    input = inputSchema.parse(rawInput);
  } catch (error) {
    throw validationError(error);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  if (typeof passwordHash !== 'string' || passwordHash.length !== 60 || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    throw new Error('No se pudo generar un hash de contraseña válido');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!input.pool && !databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio');
  }

  const pool = input.pool || new Pool({ connectionString: databaseUrl });
  const ownsPool = !input.pool;
  let client;

  try {
    client = await pool.connect();
    const auditWriter = input.auditWriter || writeAudit;
    await client.query('BEGIN');

    const clientResult = input.clienteId !== undefined
      ? await client.query(
        'SELECT id, nombre, es_plataforma FROM clientes WHERE id = $1 FOR UPDATE',
        [input.clienteId],
      )
      : await client.query(
        'SELECT id, nombre, es_plataforma FROM clientes WHERE nombre = $1 FOR UPDATE',
        [input.clienteNombre],
      );
    const cliente = clientResult.rows[0];
    if (!cliente) {
      throw new Error('El cliente no existe');
    }
    if (cliente.es_plataforma === true) {
      throw new Error('No se puede crear un administrador para el cliente plataforma');
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [input.username]);
    const existingUser = await client.query(
      'SELECT id FROM usuarios WHERE lower(username) = lower($1) FOR UPDATE',
      [input.username],
    );
    if (existingUser.rows.length > 0) {
      throw new Error('El nombre de usuario ya existe');
    }

    const userResult = await client.query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, username, nombre, rol, cliente_id`,
      [input.username, passwordHash, input.nombreAdmin, cliente.id],
    );
    const usuario = userResult.rows[0];

    // TODO: cuando exista must_change_password, marcarlo para el primer login.
    await auditWriter(client, {
      clienteId: cliente.id,
      usuarioId: usuario.id,
      username: usuario.username,
      motivo: input.motivo,
    });

    await client.query('COMMIT');
    return {
      id: usuario.id,
      username: usuario.username,
      cliente: { id: cliente.id, nombre: cliente.nombre },
    };
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original operation error.
      }
    }
    if (error && error.code === '23505') {
      throw new Error('El nombre de usuario ya existe');
    }
    throw error;
  } finally {
    if (client) client.release();
    if (ownsPool) await pool.end();
  }
}

function parseArguments(argv) {
  const values = {};
  const allowed = new Set(['--cliente-id', '--cliente-nombre', '--username', '--nombre-admin', '--motivo']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag) || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw new Error(`Argumento inválido: ${flag}`);
    }
    values[flag] = argv[index + 1];
    index += 1;
  }

  return {
    clienteId: values['--cliente-id'] === undefined ? undefined : Number(values['--cliente-id']),
    clienteNombre: values['--cliente-nombre'],
    username: values['--username'],
    nombreAdmin: values['--nombre-admin'],
    motivo: values['--motivo'],
    password: process.env.ECOTRACK_ADMIN_PASSWORD,
  };
}

async function main() {
  const result = await crearAdminCliente(parseArguments(process.argv.slice(2)));
  console.log(`Usuario administrador creado: id=${result.id}, username=${result.username}, cliente=${result.cliente.nombre} (id=${result.cliente.id})`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { crearAdminCliente, parseArguments };
