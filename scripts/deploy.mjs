#!/usr/bin/env node
/**
 * Script deploy EFLS backend lên server production.
 *
 *   node scripts/deploy.mjs
 *   REGISTRY=ghcr.io VERSION=v1.2.3 node scripts/deploy.mjs
 */

const registry = process.env.REGISTRY || 'ghcr.io/efls';
const version = process.env.VERSION || process.env.GITHUB_SHA || 'latest';

const services = ['game-core', 'api-gateway', 'realtime', 'worker', 'ai'];

async function run(cmd) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);
  try {
    const { stdout, stderr } = await execPromise(cmd, { maxBuffer: 1024 * 1024 * 10 });
    process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    process.stderr.write(error.stderr ?? error.message);
    process.exit(1);
  }
}

async function main() {
  console.log(`[deploy] Registry: ${registry}`);
  console.log(`[deploy] Version:  ${version}\n`);

  for (const svc of services) {
    const image = `${registry}/${svc}:${version}`;
    console.log(`[deploy] Pulling ${image}...`);
    await run(`docker pull ${image}`);

    console.log(`[deploy] Tagging ${image} as latest...`);
    await run(`docker tag ${image} ${registry}/${svc}:latest`);
  }

  console.log('\n[deploy] All images ready. Restarting stack...');
  await run(
    `docker compose -f infra/docker/docker-compose.yml --env-file .env --profile app up -d`,
  );

  console.log('\n[deploy] Done. Stack restarted with new images.');
}

main();
