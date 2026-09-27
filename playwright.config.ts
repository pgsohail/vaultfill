import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/serve-test-pages.mjs',
    port: 5174,
    reuseExistingServer: true,
  },
});
