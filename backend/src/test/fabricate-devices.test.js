const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const test = require('node:test');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(repositoryRoot, 'scripts', 'fabricate-devices.ps1');

function runPowerShell(args, env = process.env) {
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
    { cwd: repositoryRoot, encoding: 'utf8', env },
  );
}

function createShimEnvironment({ importCount, importOutput, tokenOutput } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-shims-'));
  const logPath = path.join(root, 'calls.log');
  const shim = path.join(root, 'shim.js');
  fs.writeFileSync(shim, `
const fs = require('fs');
const path = require('path');
const command = process.argv[2].toLowerCase();
const args = process.argv.slice(3);
const log = process.env.SHIM_LOG;
fs.appendFileSync(log, JSON.stringify({ command, args }) + '\\n');
if (command === 'python') {
  const output = args[args.indexOf('--output') + 1];
  const count = Number(args[args.indexOf('--count') + 1]);
  const rows = Array.from({ length: count }, (_, index) => ({
    device_id: 'ET-SYNTH-' + String(index + 1).padStart(2, '0'),
    softap_password: 'synthetic-softap-' + index,
    setup_pin: '123456',
    server_host: 'localhost',
    device_secret: 'synthetic-device-secret-' + index,
    nvs_image: 'synthetic.nvs.bin',
    created_at: '2026-11-04T00:00:00.000Z',
  }));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'factory.csv'),
    'device_id,softap_password,setup_pin,server_host,device_secret,nvs_image,created_at\\n' +
    rows.map((row) => Object.values(row).join(',')).join('\\n') + '\\n');
  fs.writeFileSync(path.join(output, 'backend.csv'),
    'device_id,factory_secret_hash,created_at\\n' +
    rows.map((row) => row.device_id + ',' + 'a'.repeat(64) + ',' + row.created_at).join('\\n') + '\\n');
  process.exit(0);
}
if (command === 'docker') {
  if (args.some((arg) => arg.includes('import-factory-devices.js'))) {
    const output = process.env.SHIM_IMPORT_OUTPUT ||
      ('Dispositivos de fÃ¡brica: ' +
      (process.env.SHIM_IMPORT_COUNT || '0') + ' insertados, 0 omitidos\\n');
    fs.appendFileSync(log, JSON.stringify({ output }) + '\\n');
    process.stdout.write(output);
  } else if (args.some((arg) => arg.includes('provision-device.js'))) {
    process.stdout.write('Token de reclamo: ' + process.env.SHIM_TOKEN + '\\n');
  }
  process.exit(0);
}
process.exit(0);
`, 'utf8');
  fs.writeFileSync(path.join(root, 'python.cmd'), '@echo off\r\nnode "%~dp0shim.js" python %*\r\n');
  fs.writeFileSync(path.join(root, 'docker.cmd'), '@echo off\r\nnode "%~dp0shim.js" docker %*\r\n');
  return {
    root,
    logPath,
    env: {
      ...process.env,
      PATH: `${root};${process.env.PATH}`,
      SHIM_LOG: logPath,
      SHIM_IMPORT_COUNT: String(importCount ?? 0),
      SHIM_IMPORT_OUTPUT: importOutput || '',
      SHIM_TOKEN: tokenOutput || 'SYNTHETIC-CLAIM-TOKEN',
    },
  };
}

function readShimCalls(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function withShimEnvironment(options, callback) {
  const shim = createShimEnvironment(options);
  try {
    return callback(shim);
  } finally {
    fs.rmSync(shim.root, { recursive: true, force: true });
  }
}

test('fabrication command declares required batch and output parameters', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  for (const parameter of ['Count', 'ServerHost', 'Output', 'Firmware', 'Partitions']) {
    assert.match(script, new RegExp(`\\$${parameter}\\b`));
  }
  assert.match(script, /provision_factory\.py/);
  assert.match(script, /--nvs-size/);
  assert.match(script, /--export-backend/);
});

test('fabrication command rejects repository output without creating secrets', () => {
  const result = runPowerShell([
    '-Count', '1',
    '-ServerHost', 'localhost',
    '-Output', repositoryRoot,
  ]);
  assert.notStrictEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Token de reclamo|device_secret|softap_password/i);
});

test('fabrication command never prints token values and protects the token file', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /claim-tokens\.txt/);
  assert.match(script, /icacls/);
  assert.match(script, /No se imprimen tokens|no se imprimen tokens/i);
  assert.doesNotMatch(script, /Write-Host\s+\$token|Write-Output\s+\$token/);
});

test('fabrication command validates import count before provisioning tokens', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  const importCheck = script.indexOf('^Dispositivos de f\\S+brica:');
  const tokenProvision = script.indexOf('provision-device.js');
  assert.ok(importCheck >= 0);
  assert.ok(tokenProvision > importCheck);
  assert.match(script, /\[int\]\$match\.Groups\[1\]\.Value -ne \$Count/);
  assert.match(script, /conteo inesperado/);
});

test('phase 2 does not invoke flashing tools', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(script, /write-flash|erase_flash|flash_id/i);
});

test('tests use synthetic values for token and PIN fixtures', () => {
  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.match(testSource, /SYNTHETIC-CLAIM-TOKEN/);
  assert.match(testSource, /setup_pin: '123456'/);
  assert.match(testSource, /synthetic-device-secret/);
});

test('behavior: short import aborts before provision-device', () => {
  withShimEnvironment({ importCount: 1 }, ({ env, logPath }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    try {
      const result = runPowerShell([
        '-Count', '2',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.notStrictEqual(result.status, 0);
      const calls = readShimCalls(logPath);
      assert.ok(calls.some((call) => call.command === 'docker'));
      assert.equal(calls.some((call) => (call.args || []).includes('provision-device.js')), false);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});

test('behavior: CP850 import output is parsed', () => {
  withShimEnvironment({
    importOutput: 'Dispositivos de f├íbrica: 1 insertados, 0 omitidos\\n',
  }, ({ env }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    try {
      const result = runPowerShell([
        '-Count', '1',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});

test('behavior: synthetic token is only written to the token file', () => {
  withShimEnvironment({ importCount: 1, tokenOutput: 'SYNTHETIC-CLAIM-TOKEN' }, ({ env }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    try {
      const result = runPowerShell([
        '-Count', '1',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.equal(
        result.status,
        0,
        `${result.stdout}\n${result.stderr}\n${readShimCalls(env.SHIM_LOG).map(JSON.stringify).join('\n')}`,
      );
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      assert.doesNotMatch(combinedOutput, /SYNTHETIC-CLAIM-TOKEN|123456/);
      assert.match(
        fs.readFileSync(path.join(output, 'claim-tokens.txt'), 'utf8'),
        /SYNTHETIC-CLAIM-TOKEN/,
      );
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});

test('behavior: omitted import aborts before provision-device', () => {
  withShimEnvironment({
    importOutput: 'Dispositivos de f├íbrica: 0 insertados, 1 omitidos\\n',
  }, ({ env, logPath }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    try {
      const result = runPowerShell([
        '-Count', '1',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.notStrictEqual(result.status, 0);
      const calls = readShimCalls(logPath);
      assert.equal(calls.some((call) => (call.args || []).includes('provision-device.js')), false);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});

test('behavior: non-empty output rejects before provision_factory', () => {
  withShimEnvironment({}, ({ env, logPath }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    fs.writeFileSync(path.join(output, 'existing.txt'), 'sentinel');
    try {
      const result = runPowerShell([
        '-Count', '1',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.notStrictEqual(result.status, 0);
      assert.equal(readShimCalls(logPath).length, 0);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});

test('behavior: synthetic PIN is not printed', () => {
  withShimEnvironment({ importCount: 1, tokenOutput: 'SYNTHETIC-CLAIM-TOKEN' }, ({ env }) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecotrack-fabricate-output-'));
    try {
      const result = runPowerShell([
        '-Count', '1',
        '-ServerHost', 'localhost',
        '-Output', output,
      ], env);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /123456/);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});
