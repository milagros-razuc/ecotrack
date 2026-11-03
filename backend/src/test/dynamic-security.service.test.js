const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDynamicSecurityService,
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
