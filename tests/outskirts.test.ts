import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test.use({ viewport: { width: 1280, height: 800 } });

test('darkens the cemetery ground from playable moss toward the far rim', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const screenshot = await page.screenshot({ scale: 'css' });
  await testInfo.attach('cemetery overview', { body: screenshot, contentType: 'image/png' });

  const luma = async (left: number, top: number) => {
    const pixels = await sharp(screenshot)
      .extract({ left, top, width: 10, height: 10 })
      .removeAlpha()
      .raw()
      .toBuffer();
    let total = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      total +=
        0.2126 * pixels.readUInt8(i) +
        0.7152 * pixels.readUInt8(i + 1) +
        0.0722 * pixels.readUInt8(i + 2);
    }
    return total / (pixels.length / 3);
  };

  const [moss, cemetery, rim] = await Promise.all([luma(668, 288), luma(540, 110), luma(540, 70)]);
  await testInfo.attach('cemetery luminance', {
    body: JSON.stringify({ moss, cemetery, rim }),
    contentType: 'application/json',
  });
  expect(moss).toBeGreaterThan(cemetery);
  expect(cemetery - rim).toBeGreaterThan(4);
  expect(rim).toBeGreaterThan(0);
});
