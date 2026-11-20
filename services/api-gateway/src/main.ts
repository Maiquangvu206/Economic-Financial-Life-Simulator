import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();
const server = createServer(app);

// Bảo vệ event loop khỏi request treo: header/body phải tới hạn, nhưng vẫn giữ
// keep-alive đủ dài cho trình duyệt tái sử dụng kết nối.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 65_000;

server.listen(env.GATEWAY_PORT, () => {
  console.log(`[api-gateway] listening on :${env.GATEWAY_PORT} -> ${env.CORE_URL}`);
});

// Một promise lỗi không được phép kill toàn bộ gateway (mọi người chơi sẽ mất
// kết nối). Log lại để còn dấu vết; uncaughtException mới thoát có kiểm soát.
process.on('unhandledRejection', (reason) => {
  console.error('[api-gateway] unhandledRejection', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[api-gateway] uncaughtException', error);
  setTimeout(() => process.exit(1), 500).unref();
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api-gateway] shutting down (${signal})`);
  server.close(() => process.exit(0));
  // Cho request đang xử lý tối đa 10s rồi thoát cứng.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
