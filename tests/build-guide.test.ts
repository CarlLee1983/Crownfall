import { expect, type Page, test } from '@playwright/test';
import sharp, { type Region } from 'sharp';
import { installAudioProbe } from './audio-probe';
import { accelerateWaves } from './game-fixture';

declare global {
  interface Window {
    advanceFrames(count: number): Promise<void>;
  }
}

async function selectBuildCell(page: Page) {
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 622, y: 229 } });
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();
  return ring;
}

// Midpoints of the two separate banks in the default 1280 × 720 overview.
const rightBank = { left: 784, top: 256, width: 48, height: 48 };
const leftBank = { left: 497, top: 100, width: 48, height: 48 };

async function routeDots(screenshot: Buffer, region: Region, color: 'current' | 'preview') {
  const pixels = await sharp(screenshot).extract(region).removeAlpha().raw().toBuffer();
  let count = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    const red = pixels.readUInt8(i);
    const green = pixels.readUInt8(i + 1);
    const blue = pixels.readUInt8(i + 2);
    const current = red < green * 0.83 && blue > green * 0.85 && green > 95;
    const proposed = red > 150 && green > red * 0.8 && blue < green * 0.68;
    if (color === 'current' ? current : proposed) count++;
  }
  return count;
}

test('previews and builds a detour before attackers reach the castle via the other bank', async ({
  page,
}, testInfo) => {
  test.slow();
  await accelerateWaves(page);
  const readAudio = await installAudioProbe(page);
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const lane = page.getByRole('button', { name: '路障示範格' });
  const plateau = page.getByRole('button', { name: '高台示範格' });
  await expect(lane).toBeHidden();
  await expect(plateau).toBeHidden();
  const initial = await page.screenshot({ scale: 'css' });
  expect(await routeDots(initial, rightBank, 'current')).toBeGreaterThan(20);
  expect(await routeDots(initial, leftBank, 'current')).toBe(0);

  const ring = await selectBuildCell(page);
  await expect(lane).toBeVisible();
  await expect(plateau).toBeVisible();
  await lane.click();
  const archer = ring.getByRole('button', { name: /弓箭塔/ });
  await archer.hover();
  await expect(page.getByText('改走另一條等長路線', { exact: true })).toBeVisible();
  const proposed = await page.screenshot({ scale: 'css' });
  expect(await routeDots(proposed, leftBank, 'preview')).toBeGreaterThan(20);
  expect(await routeDots(proposed, leftBank, 'current')).toBe(0);
  await testInfo.attach('detour preview', { body: proposed, contentType: 'image/png' });

  const balance = page.locator('#build-balance');
  const before = Number(await balance.textContent());
  await archer.click();
  await expect(balance).toHaveText(String(before - 50));
  await expect(lane).toBeHidden();
  await expect(plateau).toBeHidden();
  await expect(page.getByRole('button', { name: '略過' })).toBeHidden();
  const committed = await page.screenshot({ scale: 'css' });
  expect(await routeDots(committed, leftBank, 'current')).toBeGreaterThan(20);
  expect(await routeDots(committed, rightBank, 'current')).toBe(0);
  await testInfo.attach('committed detour', { body: committed, contentType: 'image/png' });

  // The (10, 7) platform covers the left bank only. Put the second tower there.
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 603, y: 120 } });
  await expect(lane).toBeHidden();
  await expect(plateau).toBeHidden();
  await archer.click();
  await expect(balance).toHaveText('0');
  await page.getByRole('button', { name: /開波/ }).click();
  await expect
    .poll(async () => (await readAudio()).scheduledPaths, { timeout: 20000 })
    .toContainEqual(expect.stringContaining('longbow-soft'));
  await expect
    .poll(async () => Number(await page.locator('#game-lives').textContent()), { timeout: 20000 })
    .toBeLessThan(20);
});

test('a barricade built while enemies approach attacks as a normal tower', async ({ page }) => {
  test.slow();
  // Use 200 ms frames to advance the game without exceeding its catch-up limit.
  await page.addInitScript(() => {
    const nextFrame = window.requestAnimationFrame.bind(window);
    let now = 0;
    window.requestAnimationFrame = (callback) => nextFrame(() => callback(now));
    Object.defineProperty(window, 'advanceFrames', {
      value: async (frames: number) => {
        for (let i = 0; i < frames; i++) {
          now += 200;
          await new Promise((resolve) => nextFrame(resolve));
        }
      },
    });
  });
  const advanceFrames = (frames: number) =>
    page.evaluate((count) => window.advanceFrames(count), frames);
  const readAudio = await installAudioProbe(page);
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const ring = await selectBuildCell(page);
  await page.getByRole('button', { name: /開波/ }).click();

  // Before the first skeleton reaches (22, 9), it is within bow range.
  await advanceFrames(25);
  await page.getByRole('button', { name: '路障示範格' }).click();
  await ring.getByRole('button', { name: /弓箭塔/ }).click();
  await advanceFrames(1);
  await expect(page.locator('#build-balance')).toHaveText('50');
  await expect
    .poll(async () => (await readAudio()).scheduledPaths)
    .toContainEqual(expect.stringContaining('longbow-soft'));
});

test('can build directly on the plateau and gain range against lower enemies', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const ring = await selectBuildCell(page);
  const guide = page.getByRole('region', { name: '建造引導' });
  await guide.getByRole('button', { name: '高台示範格' }).click();
  const archer = ring.getByRole('button', { name: /弓箭塔/ });
  await archer.hover();
  await expect(page.getByText('對高度層 0 的射程 +1.5', { exact: true })).toBeVisible();

  const balance = page.locator('#build-balance');
  const before = Number(await balance.textContent());
  await archer.click();
  await expect(balance).toHaveText(String(before - 50));
  await expect(guide).toBeHidden();
});

test('can start a wave while the guide is open, skip it, and see it again after restart', async ({
  page,
}) => {
  test.slow();
  await accelerateWaves(page);
  await page.goto('./');
  const start = page.getByRole('button', { name: '開始遊戲' });
  await start.click();
  const guide = page.getByRole('region', { name: '建造引導' });
  const wave = page.getByRole('button', { name: /開波/ });
  await selectBuildCell(page);
  await wave.click();
  await expect(wave).toBeDisabled();
  await expect(guide).toBeVisible();

  const skip = guide.getByRole('button', { name: '略過' });
  await skip.focus();
  await skip.press('Space');
  await expect(guide).toBeHidden();
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible();
  await selectBuildCell(page);
  await expect(guide).toBeHidden();

  await expect(wave).toBeEnabled({ timeout: 25000 });
  await wave.click();
  const result = page.getByRole('dialog', { name: '敗北' });
  await expect(result).toBeVisible({ timeout: 25000 });
  await expect(page.locator('#wave-preview')).toBeEmpty();
  await result.getByRole('button', { name: '重新開始' }).click();
  await start.click();
  await expect(guide).toBeHidden();
  await selectBuildCell(page);
  await expect(guide.getByRole('button', { name: '路障示範格' })).toBeVisible();
  await expect(guide.getByRole('button', { name: '高台示範格' })).toBeVisible();
});

test('frames both guide cells when the first selection is zoomed in near the entrance', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  await page.mouse.wheel(0, -900);
  // An open tile near the entrance in the resulting close-up view.
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 561, y: 104 } });

  const guide = page.getByRole('region', { name: '建造引導' });
  await expect(guide.getByRole('button', { name: '路障示範格' })).toBeInViewport();
  await expect(guide.getByRole('button', { name: '高台示範格' })).toBeInViewport();
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();

  // The selected tile stays selected when the overview is restored.
  const bounds = await page.locator('#build-anchor').boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.round((bounds?.y ?? 0) + (bounds?.height ?? 0) / 2)).toBe(368);
});

test('guide text leaves the unrelated board cell underneath it selectable', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await selectBuildCell(page);
  const pin = page.getByRole('button', { name: '路障示範格' });
  const caption = pin.locator('.build-guide-marker-label');
  await expect(caption).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');

  // A buildable platform behind the explanatory text, away from the pin.
  const point = { x: 920, y: 280 };
  const containsPoint = async (target: typeof pin) =>
    target.evaluate((node, { x, y }) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return left < x && x < right && top < y && y < bottom;
    }, point);
  expect(await containsPoint(caption)).toBe(true);
  expect(await containsPoint(pin)).toBe(false);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('region', { name: '建造環' })).toBeVisible();
  const bounds = await page.locator('#build-anchor').boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.round((bounds?.x ?? 0) + (bounds?.width ?? 0) / 2)).toBe(921);
});

test('keeps both first-selection pins clear of the wave controls after panning', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.mouse.wheel(0, -300);
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 28, y: 279 } });

  const guide = page.getByRole('region', { name: '建造引導' });
  await guide.getByRole('button', { name: '路障示範格' }).click({ trial: true, timeout: 3000 });
  await guide.getByRole('button', { name: '高台示範格' }).click({ trial: true, timeout: 3000 });
});

test('fits both guide captions at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 197, y: 352 } });
  const guide = page.getByRole('region', { name: '建造引導' });
  for (const name of ['路障示範格', '高台示範格']) {
    const pin = guide.getByRole('button', { name });
    await expect(pin.locator('.build-guide-marker-label')).toBeInViewport({ ratio: 1 });
    await pin.click({ trial: true, timeout: 3000 });
  }
});

test('keeps the guide caption legible while previewing a tower in a low build ring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 197, y: 352 } });
  await page.getByRole('button', { name: '路障示範格' }).click();
  const ring = page.getByRole('region', { name: '建造環' });
  await ring.getByRole('button', { name: /弓箭塔/ }).hover();
  const preview = page.getByText('改走另一條等長路線', { exact: true });
  await expect(preview).toBeVisible();
  const caption = page
    .getByRole('button', { name: '路障示範格' })
    .locator('.build-guide-marker-label');
  await expect(caption).toBeInViewport({ ratio: 1 });
  const [previewBounds, captionBounds] = await Promise.all([
    preview.boundingBox(),
    caption.boundingBox(),
  ]);
  if (previewBounds === null || captionBounds === null)
    throw new Error('Missing preview or caption');
  const overlapsHorizontally =
    previewBounds.x < captionBounds.x + captionBounds.width &&
    previewBounds.x + previewBounds.width > captionBounds.x;
  const overlapsVertically =
    previewBounds.y < captionBounds.y + captionBounds.height &&
    previewBounds.y + previewBounds.height > captionBounds.y;
  expect(overlapsHorizontally && overlapsVertically).toBe(false);
});
