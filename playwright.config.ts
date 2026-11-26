import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Allows using a preinstalled browser instead of `playwright install`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: `pnpm build && node .output/server/index.mjs`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      PORT: String(port),
      APP_URL: `http://localhost:${port}`,
      ADMIN_EMAIL: 'admin@example.test',
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      DATABASE_URL: 'postgres://tfc:tfc@localhost:5432/tfc',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_FROM: 'TFC Insight <noreply@example.test>',
    },
  },
})
