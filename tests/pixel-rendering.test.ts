import { expect, test } from '@playwright/test';

for (const dpr of [1, 2]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 721 } });

    test('renders the cool, dark world on a 2 CSS pixel grid', async ({ page }) => {
      await page.goto('./');
      await page.getByRole('button', { name: '開始遊戲' }).click();

      // Sample the high platform where no overlay geometry crosses it.
      const screenshot = await page.screenshot({ clip: { x: 560, y: 352, width: 60, height: 30 } });
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
          const { data } = context.getImageData(0, 0, width, height);
          const pixels = new Uint32Array(data.buffer);
          const luminance: number[] = [];
          const colors = new Set<number>();
          let nonUniformPixels = 0;
          for (let y = 0; y < height; y++) {
            const blockY = y - (y % blockSize);
            for (let x = 0; x < width; x++) {
              const blockX = x - (x % blockSize);
              const index = y * width + x;
              const color = pixels[index] ?? 0;
              const offset = index * 4;
              luminance.push(
                0.2126 * (data[offset] ?? 0) +
                  0.7152 * (data[offset + 1] ?? 0) +
                  0.0722 * (data[offset + 2] ?? 0),
              );
              colors.add(color);
              if (color !== pixels[blockY * width + blockX]) nonUniformPixels++;
            }
          }
          luminance.sort((a, b) => a - b);
          const medianLuminance = luminance[Math.floor(luminance.length / 2)] ?? 0;
          return { colors: colors.size, nonUniformPixels, width, height, medianLuminance };
        },
        { png: [...screenshot], blockSize: 2 * dpr },
      );

      expect(sample.width).toBe(60 * dpr);
      expect(sample.height).toBe(30 * dpr);
      expect(sample.colors).toBeGreaterThanOrEqual(3);
      expect(sample.nonUniformPixels).toBe(0);
      // With stronger moonlight (#111), this patch reads around 35/255.
      expect(sample.medianLuminance).toBeGreaterThan(25);
      expect(sample.medianLuminance).toBeLessThan(50);
    });
  });
}
