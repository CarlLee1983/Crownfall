import type { Page } from '@playwright/test';

// A buildable tile in the initial 1280 × 720 view.
export const openTile = { x: 654, y: 395 };

export async function accelerateWaves(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => request((time) => callback(time * 30));
  });
}
