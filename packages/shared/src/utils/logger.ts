import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Create a structured pino logger bound to a service name.
 *
 * In development: pretty-prints to stdout via pino-pretty.
 * In production: emits newline-delimited JSON to stdout, which Promtail
 * picks up from the Docker container log and forwards to Loki.
 *
 * Callers should create child loggers with a `component` field:
 *   const log = logger.child({ component: 'ebay-import' });
 */
export function createLogger(service: "scraper" | "web"): pino.Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport: isDev
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
    base: { service },
  });
}
