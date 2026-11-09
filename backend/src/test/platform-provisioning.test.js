const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { provisionarDispositivosSchema } = require('../schemas');
const {
  generateDeviceId,
  generateDeviceSecret,
  hashFactorySecret,
  nvsCsv,
  validServerHost,
} = (() => {
  const plataforma = require('../services/plataforma.service');
  const enrolamiento = require('../services/enrolamiento.service');
  return {
    ...plataforma,
    hashFactorySecret: enrolamiento.hashFactorySecret,
  };
})();

test('la identidad de fábrica cumple el formato y el hash de enrolamiento', () => {
  const deviceId = generateDeviceId();
  const secret = generateDeviceSecret();
  assert.match(deviceId, /^ET-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(
    hashFactorySecret(secret),
    crypto.createHash('sha256').update(secret, 'utf8').digest('hex'),
  );
});

test('el CSV NVS replica el formato de provision_factory.py', () => {
  assert.equal(
    nvsCsv({
      deviceId: 'ET-ABCDEFGHJKLM',
      deviceSecret: 'a'.repeat(64),
      serverHost: '192.168.1.73',
    }),
    [
      'key,type,encoding,value',
      'ecotrack,namespace,,',
      'factoryReady,data,u8,1',
      'deviceId,data,string,ET-ABCDEFGHJKLM',
      'serverHost,data,string,192.168.1.73',
      `deviceSecret,data,string,${'a'.repeat(64)}`,
      '',
    ].join('\r\n'),
  );
});

test('server host usa las mismas reglas que valid_server_host', () => {
  assert.equal(validServerHost('192.168.1.73'), true);
  assert.equal(validServerHost('mqtt.example.com'), true);
  assert.equal(validServerHost('999.1.1.1'), false);
  assert.equal(validServerHost('bad host'), false);
});

test('el body de fabricación es estricto y aplica cantidad por defecto', () => {
  assert.deepEqual(
    provisionarDispositivosSchema.parse({ motivo: 'Alta fábrica' }),
    { motivo: 'Alta fábrica', cantidad: 1 },
  );
  assert.throws(
    () => provisionarDispositivosSchema.parse({ motivo: 'Alta fábrica', cliente_id: 1 }),
  );
  assert.throws(() => provisionarDispositivosSchema.parse({ motivo: 'no' }));
});
