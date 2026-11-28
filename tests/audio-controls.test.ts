import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const outputs = new Map<AudioNode, AudioNode>();
    AudioNode.prototype.connect = new Proxy(AudioNode.prototype.connect, {
      apply: (connect, source, args) => {
        const result = Reflect.apply(connect, source, args);
        if (args[0] instanceof AudioNode) outputs.set(source, args[0]);
        return result;
      },
    });

    Object.defineProperty(window, 'readAudioGains', {
      value: () => {
        const gains: number[] = [];
        let master: number | undefined;
        for (const [source, output] of outputs) {
          if (!(source instanceof GainNode)) continue;
          gains.push(source.gain.value);
          const finalOutput =
            output instanceof DynamicsCompressorNode ? outputs.get(output) : output;
          if (finalOutput instanceof AudioDestinationNode) master = source.gain.value;
        }
        return { master, gains };
      },
    });
  });
});

declare global {
  interface Window {
    readAudioGains(): { master: number | undefined; gains: number[] };
  }
}

test('mutes the output on click and keeps it muted after reload', async ({ page }) => {
  const readMasterGain = () => page.evaluate(() => window.readAudioGains().master);
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  const mute = page.getByRole('button', { name: '靜音', exact: true });

  await page.goto('./');
  await startGame.click();
  await expect.poll(readMasterGain).toBe(1);
  await expect(mute).toHaveAttribute('aria-pressed', 'false', { timeout: 3000 });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(readMasterGain).toBe(0);

  await page.reload();
  await startGame.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(readMasterGain).toBe(0);
  await mute.press('Space');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(readMasterGain).toBe(1);
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
});

test('adjusts both audio levels from the HUD and keeps game controls accessible', async ({
  page,
}) => {
  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  await startGame.click();
  await page.getByLabel('Crownfall 關卡').click({ position: { x: 654, y: 395 } });
  const buildRing = page.getByRole('region', { name: '建造環' });
  await expect(buildRing).toBeVisible();

  const volume = page.getByRole('button', { name: '音量設定' });
  const music = page.getByRole('slider', { name: '音樂音量' });
  const effects = page.getByRole('slider', { name: '音效音量' });
  await expect(music).toBeHidden();
  await volume.press('Space', { timeout: 3000 });
  await expect(music).toHaveValue('60');
  await expect(effects).toHaveValue('100');

  const panel = await page.getByRole('group', { name: '音量設定' }).boundingBox();
  const ring = await buildRing.boundingBox();
  const waves = await page.getByRole('region', { name: '波次與時間控制' }).boundingBox();
  if (panel === null || ring === null || waves === null) throw new Error('Missing HUD region');
  expect(panel.y + panel.height).toBeLessThan(Math.min(ring.y, waves.y));

  const gains = () => page.evaluate(() => window.readAudioGains().gains);
  const hasGain = async (target: number) =>
    (await gains()).some((gain) => Math.abs(gain - target) < 0.0001);

  await music.press('ArrowLeft');
  await expect(music).toHaveValue('59');
  await expect.poll(() => hasGain(0.59)).toBe(true);
  expect(await buildRing.boundingBox()).toEqual(ring);

  const track = await effects.boundingBox();
  if (track === null) throw new Error('Missing effects slider');
  const sliderY = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width - 7, sliderY);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.3, sliderY, { steps: 5 });
  const effectsLevel = Number(await effects.inputValue());
  expect(effectsLevel).toBeGreaterThan(20);
  expect(effectsLevel).toBeLessThan(40);
  await expect.poll(() => hasGain(effectsLevel / 100)).toBe(true);
  await page.mouse.up();

  await effects.press('Escape');
  await expect(effects).toBeHidden();
  await expect(buildRing).toBeVisible();

  await page.reload();
  await startGame.click();
  await volume.click();
  await expect(music).toHaveValue('59');
  await expect(effects).toHaveValue(String(effectsLevel));
});
