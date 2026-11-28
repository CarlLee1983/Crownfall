import { expect, test } from '@playwright/test';
import sharp, { type Region } from 'sharp';
import { installAudioProbe } from './audio-probe';

test.use({ viewport: { width: 1200, height: 800 } });

test('builds on the right bank high platform before enemies enter its range', async ({
  page,
}, testInfo) => {
  const readAudio = await installAudioProbe(page);
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const overview = await page.screenshot({ scale: 'css' });
  await testInfo.attach('two banks overview', { body: overview, contentType: 'image/png' });
  const rightBank = { left: 767, top: 290, width: 40, height: 40 };
  const otherBank = { left: 448, top: 118, width: 40, height: 40 };
  const dots = async (region: Region) => {
    const pixels = await sharp(overview).extract(region).removeAlpha().raw().toBuffer();
    let count = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      const red = pixels.readUInt8(i);
      const green = pixels.readUInt8(i + 1);
      const blue = pixels.readUInt8(i + 2);
      if (red < green * 0.83 && blue > green * 0.85 && green > 95) count++;
    }
    return count;
  };
  expect(await dots(rightBank)).toBeGreaterThan(20);
  expect(await dots(otherBank)).toBe(0);

  await page.getByLabel('Crownfall 關卡').click({ position: { x: 712, y: 254 } });
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(page.getByRole('button', { name: '高台示範格' })).toBeVisible();
  await expect(page.getByRole('button', { name: '路障示範格' })).toBeVisible();
  const archer = ring.getByRole('button', { name: /弓箭塔/ });
  await archer.hover();
  await expect(page.getByText('對高度層 0 的射程 +1.5', { exact: true })).toBeVisible();
  await archer.click();
  await expect(page.locator('#build-balance')).toHaveText('50');

  await page.getByRole('button', { name: /開波/ }).click();
  await expect(page.getByRole('button', { name: /開波/ })).toBeDisabled();
  // Neither the entry lane nor the other bank is in range of this platform.
  await expect
    .poll(async () => (await readAudio()).scheduledPaths, { timeout: 15000 })
    .toContainEqual(expect.stringContaining('longbow-soft'));
});
