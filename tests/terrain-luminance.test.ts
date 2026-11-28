import { expect, test } from '@playwright/test';
import sharp, { type Region } from 'sharp';

test.use({ viewport: { width: 1280, height: 800 } });

// Default overview, away from torch pools, the route line and tile edges.
const patches = {
  platform: { left: 654, top: 188, width: 10, height: 10 },
  lane: { left: 820, top: 202, width: 10, height: 10 },
  moss: { left: 668, top: 288, width: 10, height: 10 },
  cliff: { left: 645, top: 201, width: 10, height: 8 },
};

async function meanLuma(screenshot: Buffer, patch: Region): Promise<number> {
  const pixels = await sharp(screenshot).extract(patch).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    sum +=
      0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0);
  }
  return sum / (pixels.length / 3);
}

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
    meanLuma(screenshot, patches.moss),
    meanLuma(screenshot, patches.cliff),
  ]);
  await testInfo.attach('terrain luminance', {
    body: JSON.stringify({ platform, lane, moss, cliff }),
    contentType: 'application/json',
  });
  expect(platform).toBeGreaterThan(lane);
  expect(lane).toBeGreaterThan(moss);
  expect(moss - cliff).toBeGreaterThanOrEqual(10);
  expect(cliff).toBeGreaterThanOrEqual(12);
  expect(cliff).toBeLessThanOrEqual(18);
});
