import pino from 'pino';
import { env } from '../config/env.js';

const pretty =
  env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } };

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'game-core' },
  ...(pretty ? { transport: pretty } : {}),
});
