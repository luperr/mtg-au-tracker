import postgres from "postgres";

// Connection is cached at module scope — Next.js may hot-reload in dev,
// so we attach to globalThis to avoid exhausting the connection pool.
declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  global._pgSql ??
  (global._pgSql = postgres(process.env.DATABASE_URL!, { max: 5 }));

export default sql;
