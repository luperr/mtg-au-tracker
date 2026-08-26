import { defineConfig } from "vitest/config";

/**
 * One config for the whole monorepo.
 *
 * The three projects below used to live in a `vitest.workspace.ts`, which Vitest 4
 * no longer reads — `defineWorkspace` was removed in favour of `test.projects`. The
 * file was still on disk and silently ignored, so every per-project `include` and
 * `env` in it did nothing and the suite ran off the root config alone. Keep projects
 * here; a workspace file will not be picked up.
 *
 * DATABASE_URL is set because importing the scraper's db module (and the web app's,
 * transitively through lib/db) throws at import time when it is missing. Nothing in
 * the suite connects — the value only has to parse.
 */
const DATABASE_URL = "postgresql://test:test@localhost:5432/test";

export default defineConfig({
  test: {
    env: { DATABASE_URL },
    projects: [
      {
        test: {
          name: "shared",
          environment: "node",
          include: ["packages/shared/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "scraper",
          environment: "node",
          include: ["apps/scraper/src/**/*.test.ts"],
          env: { DATABASE_URL },
        },
      },
      {
        test: {
          name: "web",
          environment: "node",
          include: ["apps/web/src/**/*.test.ts"],
          env: { DATABASE_URL },
        },
      },
    ],
  },
});
