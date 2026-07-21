/**
 * Barrel re-export — the query implementations live in ./db/{client,cards,sets,history}.ts,
 * split by concern (connection, card queries, set-analytics queries, price-history/movers
 * queries). Kept as a single import surface so call sites don't need updating.
 */
export { sql, default } from "./db/client.js";
export * from "./db/cards.js";
export * from "./db/sets.js";
export * from "./db/history.js";
