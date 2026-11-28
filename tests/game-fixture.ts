import type { Page } from '@playwright/test';

// A buildable tile in the initial 1280 × 720 view.
export const openTile = { x: 741, y: 229 };

export async function accelerateWaves(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => request((time) => callback(time * 30));
  });
}

declare global {
  interface Window {
    advanceFrames(count: number): Promise<void>;
  }
}

export async function installFrameClock(page: Page) {
  // Use 200 ms frames to advance the game without exceeding its catch-up limit.
  await page.addInitScript(() => {
    const nextFrame = window.requestAnimationFrame.bind(window);
    let now = 0;
    window.requestAnimationFrame = (callback) => nextFrame(() => callback(now));
    Object.defineProperty(window, 'advanceFrames', {
      value: async (frames: number) => {
        for (let i = 0; i < frames; i++) {
          now += 200;
          await new Promise((resolve) => nextFrame(resolve));
        }
      },
    });
  });
  return (frames: number) => page.evaluate((count) => window.advanceFrames(count), frames);
}
