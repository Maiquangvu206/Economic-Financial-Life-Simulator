/**
 * PM2 ecosystem for EFLS (low-RAM production, e.g. 3–4 GB RAM host)
 * Usage on server:
 *   pnpm install --frozen-lockfile
 *   pnpm -r build
 *   cp infra/deploy/.env.production.example .env.production  # edit values
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 */

const path = require('path');

const root = __dirname;
const nodeArgs = process.env.NODE_ARGS || '';

function app(name, cwd, script, maxMemoryRestart) {
  return {
    name,
    cwd: path.join(root, cwd),
    script,
    node_args: nodeArgs,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: maxMemoryRestart,
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    // Load env file at runtime: run with `pm2 start ... --env production` after exporting vars
    // or use `dotenv`/`env-cmd` in your start command if preferred.
    time: true,
    merge_logs: true,
  };
}

module.exports = {
  apps: [
    app('efls-api-gateway', 'services/api-gateway', 'dist/main.js', '180M'),
    app('efls-game-core', 'services/game-core', 'dist/main.js', '300M'),
    app('efls-realtime', 'services/realtime', 'dist/main.js', '220M'),
    // Enable worker only if required by your deployment (adds RAM usage)
    // app('efls-worker', 'services/worker', 'dist/main.js', '180M'),
  ],
};
