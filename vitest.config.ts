import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/env.ts", "./tests/setup.ts"],
    // Tests share one Postgres test database and truncate it between
    // cases, so files must not run concurrently against it.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
