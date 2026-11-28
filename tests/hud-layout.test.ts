import { expect, test } from '@playwright/test';

test('puts wave controls and resources in opposite upper corners', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Crownfall' })).toBeVisible();
  const start = page.getByRole('button', { name: '開始遊戲' });
  await start.click();
  await expect(start).toBeHidden();

  const controls = page.getByRole('region', { name: '波次與時間控制' });
  const resources = page.getByRole('region', { name: '生命與金錢' });
  const mute = page.getByRole('button', { name: '靜音' });
  const arrow = page.getByRole('button', { name: '音量設定' });
  // The dialog's close event returns the volume controls to the gameplay HUD.
  await expect(arrow).toBeVisible();

  const waveBox = await controls.boundingBox();
  const resourcesBox = await resources.boundingBox();
  const muteBox = await mute.boundingBox();
  const arrowBox = await arrow.boundingBox();
  if (waveBox === null || resourcesBox === null || muteBox === null || arrowBox === null)
    throw new Error('Expected visible controls and resources');
  expect(waveBox.x).toBeLessThan(32);
  expect(waveBox.y).toBeLessThan(32);
  expect(resourcesBox.x).toBeGreaterThan(960);
  expect(resourcesBox.y).toBeLessThan(64);
  expect(muteBox.x).toBeGreaterThanOrEqual(resourcesBox.x + resourcesBox.width);
  expect(arrowBox.x).toBeGreaterThanOrEqual(muteBox.x + muteBox.width);

  await arrow.click();
  const sliderBox = await page.getByRole('slider', { name: '音樂音量' }).boundingBox();
  if (sliderBox === null) throw new Error('Expected visible volume settings');
  expect(sliderBox.y).toBeGreaterThan(arrowBox.y + arrowBox.height);
  await controls.getByRole('button', { name: '暫停' }).click();
  await expect(controls.getByRole('button', { name: '繼續' })).toBeVisible();
});

test('keeps both HUD rows and volume controls within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();

  await expect(page.getByRole('region', { name: '波次與時間控制' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('region', { name: '生命與金錢' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '靜音' })).toBeInViewport({ ratio: 1 });
  const arrow = page.getByRole('button', { name: '音量設定' });
  await expect(arrow).toBeInViewport({ ratio: 1 });
  await arrow.click();
  await expect(page.getByRole('slider', { name: '音樂音量' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('slider', { name: '音效音量' })).toBeInViewport({ ratio: 1 });
});
