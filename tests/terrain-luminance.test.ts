import { expect, test } from '@playwright/test';
import { meanLuma, mossPatch } from './scene-luminance';

test.use({ viewport: { width: 1280, height: 800 } });

// Default overview, away from torch pools, the route line and tile edges.
const patches = {
  platform: { left: 752, top: 254, width: 10, height: 10 },
  lane: { left: 474, top: 143, width: 8, height: 8 },
  cliff: { left: 751, top: 293, width: 10, height: 8 },
};

test('distinguishes the four terrain layers by brightness at the default overview', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const screenshot = await page.screenshot({ scale: 'css' });
  await testInfo.attach('battlefield', { body: screenshot, contentType: 'image/png' });
  const [platform, lane, moss, cliff] = await Promise.all([
    meanLuma(screenshot, patches.platform),
    meanLuma(screenshot, patches.lane),
    meanLuma(screenshot, mossPatch),
    meanLuma(screenshot, patches.cliff),
  ]);
  await testInfo.attach('terrain luminance', {
    body: JSON.stringify({ platform, lane, moss, cliff }),
    contentType: 'application/json',
  });
  expect(platform).toBeGreaterThan(moss);
  expect(lane - moss).toBeGreaterThan(20);
  expect(moss - cliff).toBeGreaterThanOrEqual(10);
  expect(cliff).toBeGreaterThanOrEqual(12);
  expect(cliff).toBeLessThanOrEqual(18);
});
