const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDynamicSecurityService,
  requestCommand,
  RESPONSE_TOPIC,
} = require('../services/dynamicSecurity.service');

function createService(request) {
  return createDynamicSecurityService({
    connect: async () => ({
      subscribe(_topic, _options, callback) { callback(); },
      unsubscribe() {},
      end() {},
    }),
    request,
  });
}

const identity = {
  username: 'ecotrack-device-a',
  roleName: 'role-DEVICE-A',
};

test('requestCommand interpreta la respuesta dynsec real con correlationData MQTT', async () => {
  const client = {
    on(_event, listener) {
      this.listener = listener;
    },
    removeListener() {},
    publish(_topic, payload, options, callback) {
      const request = JSON.parse(payload);
      assert.equal(request.commands[0].command, 'deleteClient');
      const correlation = options.properties.correlationData;
      queueMicrotask(() => this.listener(
        RESPONSE_TOPIC,
        Buffer.from(JSON.stringify({
          responses: [{ command: 'deleteClient', success: true }],
        })),
        { properties: { correlationData: correlation } },
      ));
      callback();
    },
  };

  const response = await requestCommand(client, {
    command: 'deleteClient',
    username: identity.username,
  });

  assert.deepEqual(response, { command: 'deleteClient', success: true });
});

test('requestCommand convierte error dynsec real en rechazo sin devolver su detalle', async () => {
  const client = {
    on(_event, listener) {
      this.listener = listener;
    },
    removeListener() {},
    publish(_topic, payload, options, callback) {
      const correlation = options.properties.correlationData;
      queueMicrotask(() => this.listener(
        RESPONSE_TOPIC,
        Buffer.from(JSON.stringify({
          responses: [{
            command: JSON.parse(payload).commands[0].command,
            error: { code: 'AUTH', message: 'password=secret-value' },
          }],
        })),
        { properties: { correlationData: correlation } },
      ));
      callback();
    },
  };

  await assert.rejects(
    requestCommand(client, { command: 'deleteClient', username: identity.username }),
    (error) => {
      assert.equal(error.message, 'dynamic-security command rejected: {"code":"AUTH","message":"password=secret-value"}');
      return true;
    },
  );
});

test('provisionDevice agrega permiso de publicación para el reporte de firmware propio', async () => {
  const commands = [];
  const dynamic = createService(async (_client, command) => {
    commands.push(command);
    return {};
  });

  await dynamic.provisionDevice({
    deviceId: 'DEVICE-A',
    password: 'synthetic-password',
  });

  assert.ok(commands.some((command) =>
    command.command === 'addRoleACL'
    && command.acltype === 'publishClientSend'
    && command.topic === 'ecotrack/DEVICE-A/firmware'
    && command.allow === true
  ));
});

test('removeDevice borra el rol si el cliente ya no existe', async () => {
  const commands = [];
  const dynamic = createService(async (_client, command) => {
    commands.push(command.command);
    if (command.command === 'deleteClient') throw new Error('client does not exist');
    return {};
  });

  await dynamic.removeDevice(identity);

  assert.deepEqual(commands, ['deleteClient', 'deleteRole']);
});

test('removeDevice tolera cliente y rol inexistentes', async () => {
  const commands = [];
  const dynamic = createService(async (_client, command) => {
    commands.push(command.command);
    throw new Error(`${command.command === 'deleteClient' ? 'client' : 'role'} does not exist`);
  });

  await dynamic.removeDevice(identity);

  assert.deepEqual(commands, ['deleteClient', 'deleteRole']);
});

test('removeDevice propaga un error real de dynamic-security', async () => {
  const commands = [];
  const dynamic = createService(async (_client, command) => {
    commands.push(command.command);
    if (command.command === 'deleteClient') throw new Error('authorization denied');
    return {};
  });

  await assert.rejects(
    dynamic.removeDevice(identity),
    { message: 'authorization denied' },
  );
  assert.deepEqual(commands, ['deleteClient', 'deleteRole']);
});
