import { expect, type Page, test } from '@playwright/test';

// An open tile in the initial 1280×720 view.
const openTile = { x: 654, y: 395 };
const skeletonAsset = /\/assets\/enemy-skeleton-[\w-]+\.glb$/;

// The entrance and first stretch of lane at the configured viewport.
const entrance = { x: 579, y: 460, width: 91, height: 92 };

async function entranceBrightness(page: Page): Promise<number[]> {
  const screenshot = await page.screenshot({ clip: entrance, scale: 'css' });
  return page.evaluate(
    async (png) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
      const context = new OffscreenCanvas(image.width, image.height).getContext('2d');
      if (context === null) throw new Error('Could not read the game screenshot');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      image.close();

      return Array.from({ length: data.length / 4 }, (_, index) => {
        const offset = index * 4;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      });
    },
    [...screenshot],
  );
}

function hasBrighterBody(baseline: readonly number[], current: readonly number[]): boolean {
  let consecutiveBrightRows = 0;
  for (let y = 0; y < entrance.height; y++) {
    let brightPixels = 0;
    for (let x = 0; x < entrance.width; x++) {
      const index = y * entrance.width + x;
      if ((current[index] ?? 0) - (baseline[index] ?? 0) >= 45) brightPixels++;
    }
    // A body occupies a taller patch than the thin health bar.
    consecutiveBrightRows = brightPixels >= 6 ? consecutiveBrightRows + 1 : 0;
    if (consecutiveBrightRows >= 10) return true;
  }
  return false;
}

test('builds a tower and renders an enemy in the production game', async ({ page, baseURL }) => {
  const mount = new URL('./', baseURL);
  const requestsOutsideMount: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== mount.origin || !url.pathname.startsWith(mount.pathname)) {
      requestsOutsideMount.push(url.href);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  let releaseDownload = () => {};
  const download = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });
  await page.route(skeletonAsset, async (route) => {
    await download;
    await route.continue();
  });
  const modelRequest = page.waitForRequest(skeletonAsset);

  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  try {
    await expect(startGame).toBeDisabled();
    await expect(page.getByText('正在載入 3D 模型…')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(startGame).toBeVisible();
  } finally {
    releaseDownload();
  }
  expect(new URL((await modelRequest).url()).pathname).toMatch(/^\/crownfall\/assets\//);
  await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', /^\.\/assets\//);
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /^\.\/assets\//);
  await expect(startGame).toBeEnabled();
  await startGame.click();

  const version = process.env.APP_VERSION ?? 'dev';
  await expect(page.getByText(`版本 ${version}`, { exact: true })).toBeVisible();

  const canvas = page.getByLabel('Crownfall 關卡');
  await expect(canvas).toBeVisible();
  await canvas.click({ position: openTile });
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();
  const balance = page.locator('#build-balance');
  const before = await balance.textContent();
  await ring.getByRole('button', { name: /弓箭塔/ }).click();
  await expect(ring).toBeHidden();
  await expect(balance).not.toHaveText(before ?? '');
  await canvas.click({ position: openTile });
  const towerRing = page.getByRole('region', { name: '升級／賣出環' });
  await expect(towerRing.getByText(/弓箭塔 · 等級 1/)).toBeVisible();
  await page.keyboard.press('Escape');

  const waveControls = page.getByRole('region', { name: '波次與時間控制' });
  // While paused, starting the wave spawns its first enemy without advancing the world.
  await waveControls.getByRole('button', { name: '暫停' }).click();
  await expect(waveControls.getByRole('button', { name: '繼續' })).toBeVisible();
  const baseline = await entranceBrightness(page);
  const startWave = waveControls.getByRole('button', { name: /開波/ });
  await expect(startWave).toBeEnabled();
  await startWave.click();
  await expect(startWave).toBeDisabled();
  await expect(waveControls.getByText(/^剩餘敵人 [1-9]\d*$/)).toBeVisible();
  await expect
    .poll(async () => hasBrighterBody(baseline, await entranceBrightness(page)), {
      message: 'A body distinctly brighter than the ground appears at the entrance',
    })
    .toBe(true);
  expect(requestsOutsideMount).toEqual([]);
  expect(errors).toEqual([]);
});

for (const failure of ['download', 'texture decode'] as const) {
  test(`keeps the title open and reports a model ${failure} failure`, async ({ page }) => {
    await page.route(skeletonAsset, async (route) => {
      if (failure === 'download') {
        await route.abort();
        return;
      }
      const response = await route.fetch();
      const body = await response.body();
      const pngSignature = body.indexOf(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(pngSignature).toBeGreaterThan(0);
      body[pngSignature] = 0;
      await route.fulfill({ response, body });
    });
    await page.goto('./');
    await expect(page.getByRole('alert')).toHaveText('3D 模型載入失敗。請重新整理頁面再試一次。');
    await expect(page.getByRole('button', { name: '開始遊戲' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '操作說明' })).toBeVisible();
  });
}

test('horizontal pan stops at the map edge without drifting vertically', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await page.getByLabel('Crownfall 關卡').click({ position: openTile });
  const anchor = page.locator('#build-anchor');
  await expect(anchor).toBeVisible();
  const anchorPosition = () =>
    anchor.evaluate((node) => {
      const { x, y } = node.getBoundingClientRect();
      return { x, y };
    });
  const initial = await anchorPosition();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await anchorPosition()).x).toBeLessThan(initial.x - 8);
  const first = await anchorPosition();
  expect(first.y).toBeCloseTo(initial.y, 0);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(anchorPosition).toEqual(initial);

  for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  const edge = await anchorPosition();
  // The nearer map edge limits diagonal movement from the initial center.
  const steps = (initial.x - edge.x) / (initial.x - first.x);
  expect(steps).toBeCloseTo(7.07, 1);
  expect(edge.y).toBeCloseTo(initial.y, 0);
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  expect(await anchorPosition()).toEqual(edge);
});
