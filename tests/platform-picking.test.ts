import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type Point = readonly [x: number, y: number];
type Platform = {
  readonly center: Point;
  readonly rim: readonly [Point, Point, Point, Point];
};

// Screen coordinates from the built game at its initial camera angle.
// Rim points run clockwise from the far corner.
const desktopViews = [
  {
    viewport: { width: 1200, height: 800 },
    central: {
      center: [580, 254],
      rim: [
        [579, 220],
        [641, 254],
        [580, 292],
        [518, 254],
      ],
    },
    frontCentral: [529, 409],
    castleSide: {
      center: [357, 124],
      rim: [
        [364, 100],
        [408, 124],
        [348, 150],
        [305, 124],
      ],
    },
    frontCastle: [333, 267],
    clippedCorner: [312, 126],
  },
  {
    viewport: { width: 1024, height: 768 },
    central: {
      center: [495, 262],
      rim: [
        [495, 231],
        [551, 262],
        [496, 296],
        [440, 262],
      ],
    },
    frontCentral: [450, 401],
    castleSide: {
      center: [291, 144],
      rim: [
        [298, 121],
        [338, 144],
        [284, 168],
        [244, 144],
      ],
    },
    frontCastle: [272, 274],
    clippedCorner: [251, 145],
  },
] as const;

function between([ax, ay]: Point, [bx, by]: Point, fraction: number): Point {
  return [Math.round(ax + (bx - ax) * fraction), Math.round(ay + (by - ay) * fraction)];
}

async function screenshotPixels(screenshot: Buffer) {
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return ([x, y]: Point, matches: (red: number, green: number, blue: number) => boolean) => {
    let count = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const offset = ((y + dy) * info.width + x + dx) * 3;
        const [red = 0, green = 0, blue = 0] = data.subarray(offset, offset + 3);
        if (matches(red, green, blue)) count++;
      }
    }
    return count;
  };
}

const isSlate = (red: number, green: number, blue: number) => blue > green * 1.4 && green > red;
const isGold = (red: number, green: number, blue: number) =>
  red > 60 && red > green * 1.2 && green > blue * 2;
const isCanopy = (red: number, green: number, blue: number) =>
  green > 18 && red < green * 0.75 && blue < green * 0.55;

function viewSides({ center, rim }: Platform): ReadonlyArray<Point> {
  const [far, right, near, left] = rim;
  return [
    between(far, right, 0.5),
    between(right, near, 0.5),
    between(near, left, 0.5),
    between(left, far, 0.5),
  ].map((midpoint) => between(midpoint, center, 0.12));
}

for (const view of desktopViews) {
  const { viewport, central, frontCentral, castleSide, frontCastle, clippedCorner } = view;
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const { name, target, front, canopy } of [
      { name: 'a front tower', target: central, front: frontCentral },
      { name: 'tree canopy at the rim', target: castleSide, canopy: clippedCorner },
      {
        name: 'a front tower and tree canopy at the rim',
        target: castleSide,
        front: frontCastle,
        canopy: clippedCorner,
      },
    ]) {
      test(`selects the empty high platform with ${name}`, async ({ page }, testInfo) => {
        await page.goto('./');
        await page.getByRole('button', { name: '開始遊戲' }).click();

        const ring = page.getByRole('region', { name: '建造環' });
        const archer = ring.getByRole('button', { name: /弓箭塔/ });
        const balance = page.locator('#build-balance');
        const anchor = page.locator('#build-anchor');
        const expectSelection = async ([x, y]: Point) => {
          await expect(ring).toBeVisible();
          await expect(anchor).toBeVisible();
          const bounds = await anchor.boundingBox();
          if (bounds === null) throw new Error('Missing selected platform anchor');
          expect(Math.abs(bounds.x + bounds.width / 2 - x)).toBeLessThan(2);
          expect(Math.abs(bounds.y + bounds.height / 2 - y)).toBeLessThan(2);
        };

        if (front !== undefined) {
          await page.mouse.click(front[0], front[1]);
          await expectSelection(front);
          await archer.click();
          await expect(balance).toHaveText('50');
        }

        await page.mouse.move(viewport.width - 8, viewport.height - 8);
        const screenshot = await page.screenshot({ scale: 'css' });
        await testInfo.attach('empty platform before hovering', {
          body: screenshot,
          contentType: 'image/png',
        });
        const pixels = await screenshotPixels(screenshot);
        expect(pixels(target.center, isSlate), 'uncovered slate center').toBeGreaterThan(12);
        for (const neighbor of [target.rim[1], target.rim[3]]) {
          for (const fraction of [0.25, 0.5, 0.75]) {
            const point = between(target.rim[0], neighbor, fraction);
            expect(pixels(point, isGold), `visible gold at ${point}`).toBeGreaterThan(3);
          }
        }
        if (canopy !== undefined) {
          expect(pixels(canopy, isCanopy), 'canopy across the gold rim').toBeGreaterThan(12);
        }

        for (const point of [target.center, ...viewSides(target)]) {
          expect(pixels(point, isSlate), `visible slate at ${point}`).toBeGreaterThan(3);
          await test.step(`click ${point} once`, async () => {
            await page.mouse.click(...point);
            await expectSelection(target.center);
            await page.keyboard.press('Escape');
            await expect(ring).toBeHidden();
          });
        }

        await page.mouse.click(target.center[0], target.center[1]);
        await archer.click();
        await expect(balance).toHaveText(front === undefined ? '50' : '0');
      });
    }
  });
}
