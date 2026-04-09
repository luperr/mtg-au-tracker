import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
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
      env: {
        DATABASE_URL: "postgresql://test:test@localhost/test",
      },
    },
  },
]);
