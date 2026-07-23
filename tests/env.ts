import { config as loadEnv } from "dotenv";
import path from "node:path";

// Runs first (see vitest.config.ts setupFiles order) so DATABASE_URL/AUTH_SECRET
// are in process.env before any app module (e.g. lib/env.ts) parses them.
loadEnv({ path: path.resolve(__dirname, "../.env.test") });

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL must point at a database whose name contains "_test". ' +
      "Check .env.test - this guard exists to make it impossible for the test suite to reset the dev database.",
  );
}
