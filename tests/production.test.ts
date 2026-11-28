import { expect, type Page, test } from '@playwright/test';
import { build } from 'vite';
import manifest from '../docs/art/asset-manifest.json' with { type: 'json' };
import { installAudioProbe } from './audio-probe';
import { accelerateWaves, openTile } from './game-fixture';

// Upper section of the archer tower built on that tile.
const archerUpperBody = { x: 655, y: 376 };
// The unbuildable entrance tile in the same view.
const spawnTile = { x: 655, y: 586 };
const tileBesideSpawn = { x: 709, y: 541 };
const archerAsset = /\/assets\/tower-archer-[\w-]+\.glb$/;
const skeletonAsset = /\/assets\/enemy-skeleton-[\w-]+\.glb$/;

// The entrance and first stretch of lane at the configured viewport.
const entrance = { x: 580, y: 505, width: 100, height: 96 };

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
  await page.route(archerAsset, async (route) => {
    await download;
    await route.continue();
  });
  const archerRequest = page.waitForRequest(archerAsset);
  const skeletonResponse = page.waitForResponse(skeletonAsset);

  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  const musicSlider = page.getByRole('slider', { name: '音樂音量' });
  try {
    expect((await skeletonResponse).ok()).toBe(true);
    await expect(startGame).toBeDisabled();
    await expect(page.getByText('正在載入 3D 模型…')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(startGame).toBeVisible();
    await page.getByRole('button', { name: '音量設定' }).click();
    await musicSlider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(musicSlider).toHaveValue('59');
  } finally {
    releaseDownload();
  }
  expect(new URL((await archerRequest).url()).pathname).toMatch(/^\/crownfall\/assets\//);
  await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', /^\.\/assets\//);
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /^\.\/assets\//);
  await expect(startGame).toBeEnabled();
  await expect(musicSlider).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(musicSlider).toHaveValue('58');
  await page.getByRole('button', { name: '音量設定' }).click();
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
  await canvas.click({ position: archerUpperBody });
  const towerRing = page.getByRole('region', { name: '升級／賣出環' });
  await expect(towerRing.getByText(/弓箭塔 · 等級 1/)).toBeVisible();
  await towerRing.getByRole('button', { name: /升級/ }).click();
  await expect(towerRing.getByText(/弓箭塔 · 等級 2/)).toBeVisible();
  await page.keyboard.press('Escape');

  const waveControls = page.getByRole('region', { name: '波次與時間控制' });
  await expect(waveControls.getByText('骷髏兵 ×8', { exact: true })).toBeVisible();
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
    await page.route(failure === 'download' ? archerAsset : skeletonAsset, async (route) => {
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

test('unlocks audio on Start Game, changes music, and plays the first wave horn', async ({
  page,
}) => {
  const hornAsset = /\/assets\/war-horns-[\w-]+\.opus$/;
  const expectedClips = manifest.assets
    .flatMap(({ path }) => /^src\/audio\/clips\/(.+)\.opus$/.exec(path)?.slice(1) ?? [])
    .sort();
  const requestedAudio: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.opus')) requestedAudio.push(path);
  });

  const readAudio = await installAudioProbe(page);

  const scheduledHorn = async () =>
    (await readAudio()).scheduled.filter((seconds) => Math.abs(seconds - 4.5) < 0.05);

  let releaseHorn = () => {};
  const hornDownload = new Promise<void>((resolve) => {
    releaseHorn = resolve;
  });
  await page.route(hornAsset, async (route) => {
    await hornDownload;
    await route.continue();
  });

  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  await expect(startGame).toBeEnabled();
  expect(requestedAudio).toEqual([]);
  expect(await readAudio()).toEqual({
    contexts: [],
    scheduled: [],
    scheduledPaths: [],
    scheduledTimes: [],
    currentTime: 0,
    stops: [],
    decoded: [],
    gainValues: [],
    fadeDurations: [],
  });

  try {
    await startGame.click();
    await expect.poll(async () => (await readAudio()).contexts).toEqual(['running']);
    await expect
      .poll(() =>
        requestedAudio
          .map((path) => /^\/crownfall\/assets\/(.+)-[\w-]{8}\.opus$/.exec(path)?.[1] ?? path)
          .sort(),
      )
      .toEqual(expectedClips);
    await expect
      .poll(async () => (await readAudio()).scheduled)
      .toContainEqual(expect.closeTo(81.0, 0));
    const errorsPlayed = async () =>
      (await readAudio()).scheduledPaths.filter((path) => path.includes('ui-error-03')).length;
    const canvas = page.getByLabel('Crownfall 關卡');
    await canvas.click({ position: spawnTile });
    await expect(page.locator('#build-feedback')).toHaveText('入口、城堡與坡道不能建塔');
    await expect.poll(errorsPlayed, { timeout: 2000 }).toBe(1);

    await canvas.click({ position: tileBesideSpawn });
    await page
      .getByRole('region', { name: '建造環' })
      .getByRole('button', { name: /弓箭塔/ })
      .click();
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toEqual(expect.arrayContaining([expect.stringContaining('place-plank')]));

    await page.getByRole('button', { name: '暫停' }).click();
    expect((await readAudio()).gainValues).toContainEqual([0.5]);
    await page.getByRole('button', { name: '繼續', exact: true }).click();
    expect((await readAudio()).gainValues).toContainEqual([0.5, 1]);

    const openWave = page.getByRole('button', { name: /開波/ });
    await openWave.click();
    await expect(openWave).toBeDisabled();
    const button = await openWave.boundingBox();
    if (button === null) throw new Error('The wave button is missing');
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await expect(page.locator('#wave-feedback')).toHaveText('請等這一波結束');
    await expect.poll(errorsPlayed).toBe(2);
    await page.keyboard.press('n');
    await expect.poll(errorsPlayed).toBe(3);
    await expect
      .poll(async () => (await readAudio()).scheduled)
      .toContainEqual(expect.closeTo(92.9, 0));
    expect((await readAudio()).fadeDurations).toEqual([expect.closeTo(2), expect.closeTo(2)]);
    await page.getByRole('button', { name: /切換倍速/ }).click();
    await expect(page.getByRole('button', { name: /切換倍速/ })).toHaveText('2×');
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toEqual(expect.arrayContaining([expect.stringContaining('archer-hit-soft')]));
    expect(await scheduledHorn()).toEqual([]);
  } finally {
    releaseHorn();
  }

  await expect.poll(scheduledHorn).toEqual([expect.closeTo(4.5, 1)]);
  await expect
    .poll(async () => (await readAudio()).decoded.map(({ path }) => path).sort())
    .toEqual([...requestedAudio].sort());
  expect((await readAudio()).decoded.map(({ duration }) => duration)).toEqual(
    expect.arrayContaining([
      expect.closeTo(4.5, 1),
      expect.closeTo(81.0, 0),
      expect.closeTo(92.9, 0),
      expect.closeTo(58.5, 0),
      expect.closeTo(95.0, 0),
    ]),
  );
});

for (const delay of [0.3, 2.1]) {
  test(`fades out immediately and restarts music smoothly when decoding after ${delay}s`, async ({
    page,
  }) => {
    const readAudio = await installAudioProbe(page);
    let releaseWave = () => {};
    const waveDownload = new Promise<void>((resolve) => {
      releaseWave = resolve;
    });
    await page.route(/\/assets\/ancient-evil-awakens-[\w-]+\.opus$/, async (route) => {
      await waveDownload;
      await route.continue();
    });

    await page.goto('./');
    try {
      await page.getByRole('button', { name: '開始遊戲' }).click();
      await expect
        .poll(async () => (await readAudio()).scheduledPaths)
        .toContainEqual(expect.stringContaining('catacombs'));
      await page.getByRole('button', { name: '暫停' }).click();
      await page.getByRole('button', { name: /開波/ }).click();

      await expect.poll(async () => (await readAudio()).fadeDurations).toEqual([expect.closeTo(2)]);
      const { stops, scheduledPaths } = await readAudio();
      expect(scheduledPaths).not.toContainEqual(expect.stringContaining('ancient-evil-awakens'));
      expect(stops).toHaveLength(1);
      const outgoing = stops[0];
      if (outgoing === undefined) throw new Error('Missing outgoing music stop');
      expect(outgoing.path).toContain('catacombs');
      expect(outgoing.at - outgoing.fadeStartedAt).toBeCloseTo(2);
      await expect
        .poll(async () => (await readAudio()).currentTime - outgoing.fadeStartedAt, {
          intervals: [20, 30, 50],
        })
        .toBeGreaterThan(delay);
    } finally {
      releaseWave();
    }

    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toContainEqual(expect.stringContaining('ancient-evil-awakens'));
    const { fadeDurations } = await readAudio();
    expect(fadeDurations).toHaveLength(2);
    if (delay > 2) {
      expect(fadeDurations[1]).toBeCloseTo(0.08);
    } else {
      expect(fadeDurations[1]).toBeGreaterThan(0);
      expect(fadeDurations[1]).toBeLessThan(1.7);
    }
  });
}

test('retries defeat music and drops pending effects on restart', async ({ page }) => {
  test.slow();
  const readAudio = await installAudioProbe(page);
  await accelerateWaves(page);

  let releaseHorn = () => {};
  const hornDownload = new Promise<void>((resolve) => {
    releaseHorn = resolve;
  });
  let releaseWave = () => {};
  const waveDownload = new Promise<void>((resolve) => {
    releaseWave = resolve;
  });
  await page.route(/\/assets\/war-horns-[\w-]+\.opus$/, async (route) => {
    await hornDownload;
    await route.continue();
  });
  await page.route(/\/assets\/ancient-evil-awakens-[\w-]+\.opus$/, async (route) => {
    await waveDownload;
    await route.continue();
  });
  let defeatRequests = 0;
  let releaseDefeat = () => {};
  const defeatRetry = new Promise<void>((resolve) => {
    releaseDefeat = resolve;
  });
  await page.route(/\/assets\/the-sad-battle-[\w-]+\.opus$/, async (route) => {
    defeatRequests++;
    if (defeatRequests === 1) {
      await route.fulfill({ status: 503 });
    } else {
      await defeatRetry;
      await route.continue();
    }
  });

  const hornCount = async () =>
    (await readAudio()).scheduledPaths.filter((path) => path.includes('war-horns')).length;

  try {
    await page.goto('./');
    const startGame = page.getByRole('button', { name: '開始遊戲' });
    await startGame.click();
    const openWave = page.getByRole('button', { name: /開波/ });
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toContainEqual(expect.stringContaining('catacombs'));
    await openWave.click();
    await expect(openWave).toBeDisabled();
    await expect(openWave).toBeEnabled({ timeout: 25000 });

    releaseWave();
    await expect
      .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
      .toContainEqual(expect.stringContaining('ancient-evil-awakens'));
    expect((await readAudio()).scheduledPaths).not.toContainEqual(
      expect.stringContaining('ancient-evil-awakens'),
    );

    await openWave.click();
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toContainEqual(expect.stringContaining('ancient-evil-awakens'));
    await expect(page.getByRole('dialog', { name: '敗北' })).toBeVisible({ timeout: 25000 });
    const outgoing = (await readAudio()).stops.find(({ path }) =>
      path.includes('ancient-evil-awakens'),
    );
    if (outgoing === undefined) throw new Error('Wave music did not fade on defeat');
    expect(outgoing.at - outgoing.fadeStartedAt).toBeCloseTo(2);
    await expect.poll(() => defeatRequests).toBe(2);
    releaseDefeat();
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toContainEqual(expect.stringContaining('the-sad-battle'));

    await page.getByRole('button', { name: '重新開始' }).click();
    await startGame.click();
    releaseHorn();
    await expect
      .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
      .toContainEqual(expect.stringContaining('war-horns'));
    expect(await hornCount()).toBe(0);
    await openWave.click();
    await expect.poll(hornCount).toBe(1);
  } finally {
    releaseWave();
    releaseHorn();
    releaseDefeat();
  }
});

for (const download of ['succeeds', 'fails', 'stalls']) {
  test(`sequences interface cues when the error download ${download}`, async ({ page }) => {
    const readAudio = await installAudioProbe(page);
    const testTime = new Date('2026-01-01T00:00:00Z');
    await page.clock.install({ time: testTime });
    let releaseError = () => {};
    const errorDownload = new Promise<void>((resolve) => {
      releaseError = resolve;
    });
    await page.route(/\/assets\/ui-error-03-[\w-]+\.opus$/, async (route) => {
      await errorDownload;
      if (download === 'fails') await route.abort();
      else await route.continue();
    });
    const uiSounds = async () => {
      const { scheduledPaths, scheduledTimes } = await readAudio();
      return scheduledPaths.flatMap((path, index) =>
        /ui-error-03|place-plank/.test(path) ? [{ path, at: scheduledTimes[index] }] : [],
      );
    };

    try {
      await page.goto('./');
      await page.getByRole('button', { name: '開始遊戲' }).click();
      await expect
        .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
        .toContainEqual(expect.stringContaining('place-plank'));
      await page.getByRole('button', { name: '暫停' }).click();
      await page.getByRole('button', { name: /開波/ }).click();
      await expect(page.getByRole('button', { name: /開波/ })).toBeDisabled();
      await page.getByLabel('Crownfall 關卡').click({ position: openTile });
      const build = page
        .getByRole('region', { name: '建造環' })
        .getByRole('button', { name: /弓箭塔/ });

      // Control the UI queue deadline while keeping the native audio clock and decoder.
      await page.clock.pauseAt(testTime.getTime() + 3_600_000);
      await build.evaluate(
        (button, rejections) => {
          for (let i = 0; i < rejections; i++) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
          }
          (button as HTMLButtonElement).click();
        },
        download === 'succeeds' ? 3 : 1,
      );
      await page.clock.runFor(32);
      await expect(page.locator('#build-balance')).toHaveText('50');
      expect(await uiSounds()).toEqual([]);

      if (download === 'stalls') {
        // The confirmation sounds after the grace period while the fetch is still held.
        await page.clock.runFor(300);
        await expect.poll(uiSounds).toHaveLength(1);
      }
    } finally {
      releaseError();
    }

    const expected =
      download === 'succeeds'
        ? ['ui-error-03', 'ui-error-03', 'ui-error-03', 'place-plank']
        : ['place-plank'];
    await expect
      .poll(async () => (await uiSounds()).map(({ path }) => path))
      .toEqual(expected.map((sound) => expect.stringContaining(sound)));
    if (download === 'succeeds') {
      const starts = (await uiSounds()).map(({ at }) => at);
      for (const [index, at] of starts.slice(1).entries()) {
        const previous = starts[index];
        if (at === undefined || previous === undefined) {
          throw new Error('Missing playback timestamps for queued interface cues');
        }
        expect(at - previous).toBeCloseTo(0.06);
      }
    } else if (download === 'stalls') {
      await expect
        .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
        .toContainEqual(expect.stringContaining('ui-error-03'));
      expect(await uiSounds()).toHaveLength(1);
    }
  });
}

test('drops combat impacts that miss their playback time', async ({ page }) => {
  const readAudio = await installAudioProbe(page);
  let releaseImpact = () => {};
  const impactDownload = new Promise<void>((resolve) => {
    releaseImpact = resolve;
  });
  await page.route(/\/assets\/archer-hit-soft-[\w-]+\.opus$/, async (route) => {
    await impactDownload;
    await route.continue();
  });
  const impacts = async () =>
    (await readAudio()).scheduledPaths.filter((path) => path.includes('archer-hit-soft'));

  try {
    await page.goto('./');
    await page.getByRole('button', { name: '開始遊戲' }).click();
    const canvas = page.getByLabel('Crownfall 關卡');
    for (const position of [tileBesideSpawn, { x: 596, y: 636 }]) {
      await canvas.click({ position });
      await page
        .getByRole('region', { name: '建造環' })
        .getByRole('button', { name: /弓箭塔/ })
        .click();
    }
    await expect(page.locator('#build-balance')).toHaveText('0');
    await page.getByRole('button', { name: /開波/ }).click();
    await expect
      .poll(async () => (await readAudio()).scheduledPaths)
      .toContainEqual(expect.stringContaining('bone-break-3'));
    await page.getByRole('button', { name: '暫停' }).click();
    expect(await impacts()).toEqual([]);
  } finally {
    releaseImpact();
  }
  await expect
    .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
    .toContainEqual(expect.stringContaining('archer-hit-soft'));
  expect(await impacts()).toEqual([]);
  await page.getByRole('button', { name: '繼續', exact: true }).click();
  await expect.poll(impacts).not.toEqual([]);
});

test('starts preparation music after restart renews an exhausted retry budget', async ({
  page,
}) => {
  test.slow();
  const readAudio = await installAudioProbe(page);
  await accelerateWaves(page);

  let requests = 0;
  await page.route(/\/assets\/catacombs-[\w-]+\.opus$/, async (route) => {
    requests++;
    if (requests <= 2) await route.fulfill({ status: 503 });
    else await route.continue();
  });

  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await expect.poll(() => requests).toBe(2);
  const openWave = page.getByRole('button', { name: /開波/ });
  await openWave.click();
  await expect(openWave).toBeDisabled();
  await expect(openWave).toBeEnabled({ timeout: 25000 });
  await openWave.click();
  const result = page.getByRole('dialog', { name: '敗北' });
  await expect(result).toBeVisible({ timeout: 25000 });
  expect(requests).toBe(2);
  expect((await readAudio()).scheduledPaths).not.toContainEqual(
    expect.stringContaining('catacombs'),
  );

  await result.getByRole('button', { name: '重新開始' }).click();
  await expect(page.getByRole('dialog', { name: '操作說明' })).toBeVisible();
  await expect.poll(() => requests).toBe(3);
  await expect
    .poll(async () => (await readAudio()).scheduledPaths)
    .toContainEqual(expect.stringContaining('catacombs'));
});

async function startOneEnemyCampaign(
  page: Page,
  baseURL: string | undefined,
  contentOverrides: string,
  beforeWave?: () => Promise<void>,
): Promise<void> {
  // Exercise the normal production entry and map with deterministic combat data.
  const bundled = await build({
    build: { write: false },
    plugins: [
      {
        name: 'one-enemy-campaign',
        transform(code, id) {
          if (!id.endsWith('/src/content/content.ts')) return;
          return `${code}
            ${contentOverrides}
            content.waves.splice(0, content.waves.length, {
              groups: [{ enemy: 'grunt', count: 1, interval: 1, delay: 0 }]
            });
          `;
        },
      },
    ],
  });
  if (!('output' in bundled)) throw new Error('Expected a single production bundle');
  const output = new Map(bundled.output.map((asset) => [asset.fileName, asset]));
  const mount = new URL('./', baseURL);
  await page.route(`${mount.href}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(mount.pathname.length);
    const asset = output.get(path || 'index.html');
    if (asset === undefined) return route.fulfill({ status: 404 });
    const contentTypes: Readonly<Record<string, string>> = {
      wasm: 'application/wasm',
      css: 'text/css',
      js: 'text/javascript',
      glb: 'model/gltf-binary',
      opus: 'audio/ogg',
    };
    const extension = path.split('.').at(-1) ?? '';
    const contentType = contentTypes[extension] ?? 'text/html';
    const source = asset.type === 'chunk' ? asset.code : asset.source;
    await route.fulfill({
      contentType,
      body: typeof source === 'string' ? source : Buffer.from(source),
    });
  });

  const startTime = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: startTime });
  await page.clock.pauseAt(new Date(startTime.getTime() + 1_000));
  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  await expect(startGame).toBeEnabled();
  await startGame.press('Enter');
  await page.clock.runFor(16);

  await page.getByLabel('Crownfall 關卡').dispatchEvent('click', {
    clientX: openTile.x,
    clientY: openTile.y,
    button: 0,
  });
  const ring = page.getByRole('region', { name: '建造環' });
  await page.clock.runFor(16);
  await ring.getByRole('button', { name: /弓箭塔/ }).dispatchEvent('click');
  await page.clock.runFor(48);

  await beforeWave?.();
  const startWave = page.getByRole('button', { name: /開波/ });
  await startWave.dispatchEvent('click');
}

test('plays impact and death with the final kill before opening the victory dialog', async ({
  page,
  baseURL,
}) => {
  const readAudio = await installAudioProbe(page);
  const combatSounds = async () =>
    (await readAudio()).scheduledPaths.filter((path) =>
      /longbow-soft|archer-hit-soft|bone-break-3/.test(path),
    );
  await startOneEnemyCampaign(
    page,
    baseURL,
    'Object.assign(content.towers.basic, { range: 20, damage: 100 });',
    async () => {
      await expect
        .poll(async () => (await readAudio()).decoded.map(({ path }) => path))
        .toEqual(
          expect.arrayContaining([
            expect.stringContaining('longbow-soft'),
            expect.stringContaining('archer-hit-soft'),
            expect.stringContaining('bone-break-3'),
          ]),
        );
    },
  );
  await page.clock.runFor(64);
  const victory = page.getByRole('dialog', { name: '勝利' });
  await expect(page.locator('#wave-feedback')).toContainText('清波獎勵');
  await expect(victory).toBeHidden();
  const bounty = page.locator('.combat-bounty');
  await expect(bounty).toHaveCount(0);
  expect(await combatSounds()).toEqual([expect.stringContaining('longbow-soft')]);
  await page.clock.runFor(128);
  await expect(bounty).toHaveText('+5');
  expect(await combatSounds()).toEqual([
    expect.stringContaining('longbow-soft'),
    expect.stringContaining('archer-hit-soft'),
    expect.stringContaining('bone-break-3'),
  ]);
  await expect(victory).toBeHidden();
  await page.clock.runFor(230);
  await expect(victory).toBeVisible();
});

test('shows defeat after the castle pulse while many shots are still queued', async ({
  page,
  baseURL,
}) => {
  await startOneEnemyCampaign(
    page,
    baseURL,
    `
      content.startingLives = 1;
      Object.assign(content.enemies.grunt, { hp: 100, speed: 100 });
      Object.assign(content.towers.basic, { range: 200, damage: 1, shotsPerSecond: 30 });
    `,
  );
  const lives = page.locator('#game-lives');
  for (let elapsed = 0; elapsed < 1_000; elapsed += 16) {
    await page.clock.runFor(16);
    if ((await lives.textContent()) === '0') break;
  }
  const defeat = page.getByRole('dialog', { name: '敗北' });
  await expect(lives).toHaveText('0');
  expect(await lives.evaluate((element) => Number(element.style.scale))).toBeGreaterThan(1);
  await expect(defeat).toBeHidden();

  await page.clock.runFor(250);
  await expect(defeat).toBeVisible();
});
