import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { DPR, HEIGHT, WIDTH } from './viewport';

const entry = 'scripts/perf/benchmark.html';
const outDir = await mkdtemp(join(tmpdir(), 'crownfall-perf-'));

try {
  const buildOptions = { outDir, emptyOutDir: false, rolldownOptions: { input: entry } };
  await build({ build: buildOptions, logLevel: 'warn' });
  const server = await preview({
    build: buildOptions,
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'warn',
  });
  try {
    const address = server.httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('效能量測伺服器未啟動');
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: DPR,
      });
      await page.goto(`http://127.0.0.1:${address.port}/${entry}`);
      const result = await page.evaluate(async () => {
        if (window.benchmarkResult === undefined) throw new Error('找不到效能量測入口');
        return await window.benchmarkResult;
      });
      console.log(JSON.stringify({ chrome: browser.version(), ...result }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}
