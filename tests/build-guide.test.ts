import { expect, type Page, test } from '@playwright/test';
import { accelerateWaves, openTile } from './game-fixture';

async function selectBuildCell(page: Page) {
  await page.getByLabel('Crownfall 關卡').click({ position: openTile });
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();
  return ring;
}

test('demonstrates a real lane detour and dismisses the guide after building', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const lane = page.getByRole('button', { name: '路障示範格' });
  const plateau = page.getByRole('button', { name: '高台示範格' });
  await expect(lane).toBeHidden();
  await expect(plateau).toBeHidden();

  const ring = await selectBuildCell(page);
  await expect(lane).toBeVisible();
  await expect(plateau).toBeVisible();
  // The marker's diamond is centered on the lane tile in this view.
  await page.mouse.click(712, 146);
  const archer = ring.getByRole('button', { name: /弓箭塔/ });
  await archer.hover();
  await expect(page.getByText('路線 +2 格', { exact: true })).toBeVisible();

  const balance = page.locator('#build-balance');
  const before = Number(await balance.textContent());
  await archer.click();
  await expect(balance).toHaveText(String(before - 50));
  await selectBuildCell(page);
  await expect(lane).toBeHidden();
  await expect(plateau).toBeHidden();
  await expect(page.getByRole('button', { name: '略過' })).toBeHidden();
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
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 654, y: 175 } });

  const guide = page.getByRole('region', { name: '建造引導' });
  await expect(guide.getByRole('button', { name: '路障示範格' })).toBeInViewport();
  await expect(guide.getByRole('button', { name: '高台示範格' })).toBeInViewport();
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();

  // The selected tile stays selected when the overview is restored.
  const bounds = await page.locator('#build-anchor').boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.round((bounds?.y ?? 0) + (bounds?.height ?? 0) / 2)).toBe(462);
});

test('guide text leaves the unrelated board cell underneath it selectable', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await selectBuildCell(page);
  const pin = page.getByRole('button', { name: '路障示範格' });
  const caption = pin.locator('.build-guide-marker-label');
  await expect(caption).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');

  // A buildable lane tile behind the explanatory text, away from the pin.
  const point = { x: 838, y: 164 };
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
  expect(Math.round((bounds?.x ?? 0) + (bounds?.width ?? 0) / 2)).toBe(839);
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
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 161, y: 406 } });
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
  // A lane tile that cannot be blocked, with the build ring below the guide.
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 221, y: 384 } });
  const ring = page.getByRole('region', { name: '建造環' });
  await ring.getByRole('button', { name: /弓箭塔/ }).hover();
  const preview = page.getByText('會讓入口到城堡斷線', { exact: true });
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
