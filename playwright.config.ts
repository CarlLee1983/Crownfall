import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173/crownfall/';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    // GitHub-hosted runners use software rendering for the WebGL scene.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'bun run preview --host 127.0.0.1 --port 4173 --strictPort --base /crownfall/',
    url: baseURL,
    reuseExistingServer: false,
  },
});
