import { defineConfig, devices } from '@playwright/test'
import { E2E_EMAILS } from './tests/e2e/helpers'

try {
  process.loadEnvFile('.env.local')
} catch {
  // CI provides env vars directly.
}

const PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      ALLOWED_EMAILS: Object.values(E2E_EMAILS).join(','),
      // Separate build folder so the test server can run while `pnpm dev` is up.
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
