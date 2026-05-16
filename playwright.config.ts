import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.INFRA_DASHBOARD_E2E_URL || 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
  },
  webServer: process.env.INFRA_DASHBOARD_E2E_URL
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3210',
        url: 'http://127.0.0.1:3210',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
