const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// These cases need Windows PowerShell or local MQTT test certificates that are
// deliberately excluded from Git. Run them in their dedicated environments.
const excluded = new Set([
  'fabricate-devices.test.js',
  'mqtt-acl.integration.test.js',
  'mqtt-tls.integration.test.js',
]);

const backendRoot = path.resolve(__dirname, '..');
const directories = [
  path.join(backendRoot, 'src', 'test'),
  path.resolve(backendRoot, '..', 'frontend'),
  path.resolve(backendRoot, '..', 'frontend', 'shared'),
];
const files = directories.flatMap((directory) =>
  fs.readdirSync(directory)
    .filter((name) => name.endsWith('.test.js') && !excluded.has(name))
    .map((name) => path.join(directory, name))
).sort();

if (files.length === 0) {
  throw new Error('No CI test files were found');
}

const result = spawnSync(process.execPath, [
  '--test', '--test-timeout=30000', '--test-concurrency=1', ...files,
], { cwd: backendRoot, stdio: 'inherit' });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
