/**
 * @efls/contracts
 *
 * Cross-boundary contracts only:
 * - HTTP request/response payloads
 * - Socket.IO event payloads
 * - Shared enums and primitive value schemas
 *
 * Do NOT put business rules, database models, or React components here.
 * The server is authoritative; these schemas validate shape, not permission.
 */
export * from './common/ids.js';
export * from './common/money.js';
export * from './common/pagination.js';
export * from './common/errors.js';
export * from './enums/index.js';
export * from './http/auth.js';
export * from './http/characters.js';
export * from './http/banking.js';
export * from './http/careers.js';
export * from './http/companies.js';
export * from './http/stock-market.js';
export * from './http/real-estate.js';
export * from './http/law.js';
export * from './http/underworld.js';
export * from './http/logistics.js';
export * from './http/map.js';
export * from './http/tax.js';
export * from './http/notifications.js';
export * from './http/game.js';
export * from './http/admin.js';
export * from './http/ai.js';
export * from './realtime/rooms.js';
export * from './realtime/events.js';
