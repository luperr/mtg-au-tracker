/**
 * Next.js instrumentation hook — runs once on server startup before any request
 * is handled. Importing the logger here ensures it is initialised early.
 */
export async function register() {
  // Importing logger ensures pino is initialised before the first request.
  // The logger is exported from lib/logger and used directly in API routes.
  await import("./lib/logger.js");
}
