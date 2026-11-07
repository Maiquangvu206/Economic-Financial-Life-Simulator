import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.GATEWAY_PORT, () => {
  console.log(`[api-gateway] listening on :${env.GATEWAY_PORT} -> ${env.CORE_URL}`);
});
