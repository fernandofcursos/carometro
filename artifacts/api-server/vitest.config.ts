import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/tests/**", "src/scripts/**", "src/test-*.ts"],
    },
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "../../lib/db/src/index.ts"),
    },
  },
});
