import { expect, type Page, test } from '@playwright/test';

async function hasEnemyBodyAtEntrance(page: Page): Promise<boolean> {
  const screenshot = await page.screenshot({
    // First stretch of lane at the configured viewport, below the entrance flag.
    clip: { x: 400, y: 271, width: 130, height: 20 },
    style: '#wave-flag { visibility: hidden !important; }',
  });
  return page.evaluate(
    async (png) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
      const context = new OffscreenCanvas(image.width, image.height).getContext('2d');
      if (context === null) throw new Error('Could not read the game screenshot');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      image.close();

      // The first wave's grunts have gold bodies. Allow for lighting and antialiasing.
      let goldPixels = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        if (red > 100 && red - green > 20 && green - blue > 45) goldPixels++;
        if (goldPixels >= 12) return true;
      }
      return false;
    },
    [...screenshot],
  );
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

  await page.goto('./');
  await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', /^\.\/assets\//);
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /^\.\/assets\//);
  await page.getByRole('button', { name: '開始遊戲' }).click();

  const canvas = page.getByLabel('Crownfall 關卡');
  await expect(canvas).toBeVisible();
  // An open tile near the center of the initial view at the configured viewport.
  const tile = { x: 670, y: 330 };
  await canvas.click({ position: tile });
  const ring = page.getByRole('region', { name: '建造環' });
  await expect(ring).toBeVisible();
  const balance = page.locator('#build-balance');
  const before = await balance.textContent();
  await ring.getByRole('button', { name: /基本塔/ }).click();
  await expect(ring).toBeHidden();
  await expect(balance).not.toHaveText(before ?? '');
  await canvas.click({ position: tile });
  const towerRing = page.getByRole('region', { name: '升級／賣出環' });
  await expect(towerRing.getByText(/基本塔 · 等級 1/)).toBeVisible();
  await page.keyboard.press('Escape');

  expect(await hasEnemyBodyAtEntrance(page)).toBe(false);
  const startWave = page.getByRole('button', { name: /開波/ });
  await startWave.click();
  await expect(startWave).toBeDisabled();
  await expect
    .poll(() => hasEnemyBodyAtEntrance(page), {
      message: 'An enemy body appears near the entrance',
    })
    .toBe(true);
  expect(requestsOutsideMount).toEqual([]);
  expect(errors).toEqual([]);
});
