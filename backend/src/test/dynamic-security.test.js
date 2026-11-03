const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { isAuthorizationDenial, publish, subscribe, runCase } = require('../../../scripts/verify-mqtt-dynamic-security');
const {
  createDynamicSecurityService,
  CONTROL_TOPIC,
  RESPONSE_TOPIC,
  validateDeviceId,
  validateStaticUsernames,
} = require('../services/dynamicSecurity.service');

test('device IDs reject topic separators and whitespace', () => {
  assert.doesNotThrow(() => validateDeviceId('node-01_A'));
  assert.throws(() => validateDeviceId('node/other'), /Invalid device id/);
  assert.throws(() => validateDeviceId('node one'), /Invalid device id/);
});

test('provisioning rejects names already present in the static passwd file', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\necotrack-test-a:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticUsernames('dynsec-admin', ['TEST-A'], passwdPath),
    /also exists in static passwd/,
  );
  assert.throws(
    () => validateStaticUsernames('backend-static', ['TEST-B'], passwdPath),
    /also exists in static passwd/,
  );
});

test('provisioning rejects duplicate generated usernames', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticUsernames('dynsec-admin', ['NodeA', 'nodea'], passwdPath),
    /must be unique/,
  );
});

test('only broker authorization errors count as denied operations', () => {
  assert.equal(isAuthorizationDenial('Publish error: Not authorized'), true);
  assert.equal(isAuthorizationDenial('Subscribe error: Not authorised'), true);
  assert.equal(isAuthorizationDenial('Connection refused'), false);
  assert.equal(isAuthorizationDenial('Timed out'), false);
});

test('publish reports transport failures separately from ACL denial', async () => {
  const authorization = await publish({ publish: (_topic, _payload, _options, callback) => {
    callback(new Error('Not authorized'));
  } }, 'ecotrack/A/lecturas');
  assert.equal(authorization.denied, true);
  assert.equal(authorization.ok, false);

  const transport = await publish({ publish: (_topic, _payload, _options, callback) => {
    callback(new Error('Connection reset'));
  } }, 'ecotrack/A/lecturas');
  assert.equal(transport.denied, false);
  assert.equal(transport.ok, false);
});

test('subscription QoS 128 is an ACL denial; a connection failure never passes a denied case', async () => {
  const result = await subscribe({ subscribe: (_topic, _options, callback) => {
    callback(null, [{ qos: 128 }]);
  } }, 'ecotrack/B/lecturas');
  assert.equal(result.denied, true);

  const failed = await runCase(
    { username: 'device-a' },
    {},
    'publish',
    'ecotrack/B/lecturas',
    false,
    async () => { throw new Error('TLS certificate rejected'); },
  );
  assert.deepEqual({ passed: failed.passed, result: failed.result }, { passed: false, result: 'error' });
});

function fakeBroker({ rejectCommand, wrongCorrelation = false, responseMode } = {}) {
  const commands = [];
  let connectOptions;
  let subscribed = false;
  class FakeClient extends EventEmitter {
    end() {}

    subscribe(topic, _options, callback) {
      assert.equal(topic, RESPONSE_TOPIC);
      subscribed = true;
      callback(null);
    }

    publish(topic, payload, options, callback) {
      assert.equal(topic, CONTROL_TOPIC);
      assert.equal(subscribed, true, 'the response subscription must precede commands');
      const request = JSON.parse(payload);
      const command = request.commands[0];
      commands.push(command);
      setImmediate(() => {
        const correlation = Buffer.from(options.properties.correlationData);
        if (wrongCorrelation) {
          this.emit('message', RESPONSE_TOPIC, Buffer.from('{}'), {
            properties: { correlationData: Buffer.from('unmatched') },
          });
          callback(null);
          return;
        }
        const response = { responses: [{ command: command.command }] };
        if (command.command === rejectCommand) response.responses[0].error = 'rejected';
        const responsePayload = responseMode === 'malformed'
          ? '{'
          : JSON.stringify(responseMode === 'duplicate'
            ? { responses: [response.responses[0], response.responses[0]] }
            : response);
        this.emit('message', RESPONSE_TOPIC, Buffer.from(responsePayload), {
          properties: { correlationData: correlation },
        });
        callback(null);
      });
    }
  }
  const mqttModule = {
    connect: (_url, options) => {
      connectOptions = options;
      const client = new FakeClient();
      setImmediate(() => client.emit('connect'));
      return client;
    },
  };
  return { mqttModule, commands, getConnectOptions: () => connectOptions };
}

test('dynamic-security provisioning uses validated TLS and exact per-device ACLs', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const broker = fakeBroker();
  const service = createDynamicSecurityService({
    mqttModule: broker.mqttModule,
    env: {
      DYNSEC_ADMIN_USER: 'dynsec-admin',
      DYNSEC_ADMIN_PASS: 'hidden-test-value',
      DYNSEC_PASSWD_PATH: passwdPath,
      DYNSEC_CA_PATH: path.join(directory, 'ca.crt'),
    },
    fsModule: { readFileSync: () => Buffer.from('test-ca') },
  });

  const result = await service.provisionDevice({ deviceId: 'NODE_01', password: 'test-password' });
  assert.equal(result.username, 'ecotrack-node_01');
  assert.equal(result.topic, 'ecotrack/NODE_01/lecturas');
  assert.equal(broker.getConnectOptions().rejectUnauthorized, true);
  assert.deepEqual(broker.commands.map((command) => command.command), [
    'createRole', 'addRoleACL', 'addRoleACL', 'addRoleACL', 'createClient',
  ]);
  assert.equal(broker.commands[1].topic, 'ecotrack/NODE_01/lecturas');
  assert.equal(broker.commands[2].allow, false);
  assert.equal(broker.commands[3].topic, 'ecotrack/NODE_01/#');
  assert.deepEqual(broker.commands[4].roles, [{ rolename: 'role-NODE_01', priority: 1 }]);
});

test('dynamic-security provisioning compensates a partially created role', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const broker = fakeBroker({ rejectCommand: 'addRoleACL' });
  const service = createDynamicSecurityService({
    mqttModule: broker.mqttModule,
    env: {
      DYNSEC_ADMIN_USER: 'dynsec-admin',
      DYNSEC_ADMIN_PASS: 'hidden-test-value',
      DYNSEC_PASSWD_PATH: passwdPath,
      DYNSEC_CA_PATH: path.join(directory, 'ca.crt'),
    },
    fsModule: { readFileSync: () => Buffer.from('test-ca') },
  });

  await assert.rejects(service.provisionDevice({ deviceId: 'NODE_02' }), /rejected addRoleACL/);
  assert.equal(broker.commands.at(-1).command, 'deleteRole');
});

test('dynamic-security ignores a response with a different correlation value', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const broker = fakeBroker({ wrongCorrelation: true });
  const service = createDynamicSecurityService({
    mqttModule: broker.mqttModule,
    env: {
      DYNSEC_ADMIN_USER: 'dynsec-admin',
      DYNSEC_ADMIN_PASS: 'hidden-test-value',
      DYNSEC_PASSWD_PATH: passwdPath,
      DYNSEC_CA_PATH: path.join(directory, 'ca.crt'),
    },
    fsModule: { readFileSync: () => Buffer.from('test-ca') },
    timeoutMs: 5,
  });

  await assert.rejects(service.provisionDevice({ deviceId: 'NODE_03' }), /timeout: createRole/);
  assert.equal(broker.commands.length, 1);
});

test('dynamic-security rejects malformed and duplicate command responses', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  const passwdPath = path.join(directory, 'passwd');
  fs.writeFileSync(passwdPath, 'backend-static:hash\n');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  for (const [responseMode, expected] of [
    ['malformed', /Malformed Dynamic Security response/],
    ['duplicate', /Unexpected Dynamic Security response/],
  ]) {
    const broker = fakeBroker({ responseMode });
    const service = createDynamicSecurityService({
      mqttModule: broker.mqttModule,
      env: {
        DYNSEC_ADMIN_USER: 'dynsec-admin',
        DYNSEC_ADMIN_PASS: 'hidden-test-value',
        DYNSEC_PASSWD_PATH: passwdPath,
        DYNSEC_CA_PATH: path.join(directory, 'ca.crt'),
      },
      fsModule: { readFileSync: () => Buffer.from('test-ca') },
    });
    await assert.rejects(service.provisionDevice({ deviceId: `NODE_${responseMode}` }), expected);
  }
});

test('dynamic-security removal deletes only the selected device client and role', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-dynsec-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const broker = fakeBroker();
  const service = createDynamicSecurityService({
    mqttModule: broker.mqttModule,
    env: {
      DYNSEC_ADMIN_USER: 'dynsec-admin',
      DYNSEC_ADMIN_PASS: 'hidden-test-value',
      DYNSEC_CA_PATH: path.join(directory, 'ca.crt'),
    },
    fsModule: { readFileSync: () => Buffer.from('test-ca') },
  });

  const result = await service.removeDevice({ deviceId: 'NODE_04' });
  assert.equal(result.removed, true);
  assert.deepEqual(broker.commands, [
    { command: 'deleteClient', username: 'ecotrack-node_04' },
    { command: 'deleteRole', rolename: 'role-NODE_04' },
  ]);
});
