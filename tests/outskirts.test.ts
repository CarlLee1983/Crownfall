import { expect, test } from '@playwright/test';
import { meanLuma, mossPatch } from './scene-luminance';

test.use({ viewport: { width: 1280, height: 800 } });

test('darkens the cemetery ground from playable moss toward the far rim', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const screenshot = await page.screenshot({ scale: 'css' });
  await testInfo.attach('cemetery overview', { body: screenshot, contentType: 'image/png' });

  const [moss, cemetery, rim] = await Promise.all([
    meanLuma(screenshot, mossPatch),
    meanLuma(screenshot, { left: 910, top: 699, width: 10, height: 10 }),
    meanLuma(screenshot, { left: 970, top: 740, width: 10, height: 10 }),
  ]);
  await testInfo.attach('cemetery luminance', {
    body: JSON.stringify({ moss, cemetery, rim }),
    contentType: 'application/json',
  });
  expect(moss).toBeGreaterThan(cemetery);
  expect(cemetery - rim).toBeGreaterThan(4);
  expect(rim).toBeGreaterThan(0);
});
