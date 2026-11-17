#!/usr/bin/env node
/**
 * Pull a release from the registry and restart the Docker Compose app profile.
 * Run from any directory; .env and compose paths are resolved from the repo root.
 *
 *   REGISTRY=ghcr.io/owner VERSION=<git-sha> node scripts/deploy.mjs
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const registry = process.env.REGISTRY || 'ghcr.io/efls';
const version = process.env.VERSION || process.env.GITHUB_SHA || 'latest';
const services = ['game-core', 'api-gateway', 'realtime', 'worker', 'ai'];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = resolve(repoRoot, 'infra/docker/docker-compose.yml');
const envFile = resolve(repoRoot, '.env');

if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]+)?(?:\/[a-z0-9._-]+)*$/.test(registry)) {
  throw new Error(`Invalid REGISTRY value: ${registry}`);
}
if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(version)) {
  throw new Error(`Invalid VERSION value: ${version}`);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function main() {
  console.log(`[deploy] Registry: ${registry}`);
  console.log(`[deploy] Version:  ${version}`);

  for (const service of services) {
    const image = `${registry}/${service}:${version}`;
    const composeImage = `efls/${service}:local`;
    console.log(`[deploy] Pulling ${image}`);
    await run('docker', ['pull', image]);
    console.log(`[deploy] Staging ${composeImage}`);
    await run('docker', ['image', 'tag', image, composeImage]);
  }

  console.log('[deploy] Restarting Compose app profile with pulled images');
  await run('docker', [
    'compose',
    '-f',
    composeFile,
    '--env-file',
    envFile,
    '--profile',
    'app',
    'up',
    '-d',
    '--no-build',
  ]);
  await run('docker', [
    'compose',
    '-f',
    composeFile,
    '--env-file',
    envFile,
    '--profile',
    'app',
    'ps',
  ]);
  console.log('[deploy] Compose update completed. Verify service health before routing traffic.');
}

main().catch((error) => {
  console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
