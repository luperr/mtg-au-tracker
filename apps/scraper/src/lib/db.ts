/**
 * Database connection.
 * Reads DATABASE_URL from the environment and creates a Drizzle client.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create the raw postgres connection
const client = postgres(DATABASE_URL);

// Wrap it with Drizzle — this is what we import everywhere else
export const db = drizzle(client, { schema });
export { schema };
