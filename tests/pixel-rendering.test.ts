import { expect, test } from '@playwright/test';

for (const dpr of [1, 2]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1200, height: 720 } });

    test('renders the world on a 3 CSS pixel grid', async ({ page }) => {
      await page.goto('./');
      await page.getByRole('button', { name: '開始遊戲' }).click();

      // The left edge of the board crosses this region without any overlay geometry.
      const screenshot = await page.screenshot({ clip: { x: 180, y: 240, width: 60, height: 90 } });
      const sample = await page.evaluate(
        async ({ png, blockSize }) => {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(png)], { type: 'image/png' }),
          );
          const { width, height } = image;
          const context = new OffscreenCanvas(width, height).getContext('2d');
          if (context === null) throw new Error('Could not read the game screenshot');
          context.drawImage(image, 0, 0);
          image.close();
          const pixels = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
          const colors = new Set<number>();
          let nonUniformPixels = 0;
          for (let y = 0; y < height; y++) {
            const blockY = y - (y % blockSize);
            for (let x = 0; x < width; x++) {
              const blockX = x - (x % blockSize);
              const color = pixels[y * width + x] ?? 0;
              colors.add(color);
              if (color !== pixels[blockY * width + blockX]) nonUniformPixels++;
            }
          }
          return { colors: colors.size, nonUniformPixels, width, height };
        },
        { png: [...screenshot], blockSize: 3 * dpr },
      );

      expect(sample.width).toBe(60 * dpr);
      expect(sample.height).toBe(90 * dpr);
      expect(sample.colors).toBeGreaterThanOrEqual(3);
      expect(sample.nonUniformPixels).toBe(0);
    });
  });
}
