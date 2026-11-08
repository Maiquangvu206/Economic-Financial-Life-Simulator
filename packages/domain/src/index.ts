/**
 * @efls/domain
 *
 * Pure, deterministic game rules. No IO, no database, no network, no clock.
 * Time and external data must be passed in as explicit arguments.
 *
 * Used by: services/game-core, services/worker.
 * Never imported by browser apps; the server is authoritative.
 */
export * from './money.js';
export * from './credit.js';
export * from './banking.js';
export * from './stock/orderBook.js';
export * from './crime/heat.js';
export * from './npc.js';
export * from './gm.js';
export * from './elections.js';
export * from './cccd.js';
export * from './provinceMap.js';
export * from './tax/auditRisk.js';
export * from './education.js';
export * from './timeAndSeasons.js';
