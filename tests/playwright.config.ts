import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    // httpOnly cookies require credentials: "include" — Playwright handles this automatically
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Use the pre-installed Chromium in the remote environment
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? {
      launchOptions: { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium/chrome` },
    } : {}),
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the full stack before running E2E tests
  // Disable in CI unless a real DB is available (set E2E_SKIP_WEBSERVER=1)
  webServer: process.env.E2E_SKIP_WEBSERVER ? undefined : [
    {
      command: "pnpm --filter @workspace/api-server run dev",
      url: "http://localhost:8080/api/healthz",
      timeout: 30_000,
      reuseExistingServer: true,
      env: {
        PORT: "8080",
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-secret-local",
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "01234567890123456789012345678901",
        FRONTEND_URL: "http://localhost:5000",
      },
    },
    {
      command: "pnpm --filter @workspace/seshat run dev",
      url: "http://localhost:5000",
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
});
