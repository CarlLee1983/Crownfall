import { expect, test } from '@playwright/test';
import { accelerateWaves, openTile } from './game-fixture';

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

test('preserves mute and the latest slider values through reload and unmute', async ({ page }) => {
  const readGains = () => page.evaluate(() => window.readAudioGains());
  const readMasterGain = async () => (await readGains()).master;
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  const mute = page.getByRole('button', { name: '靜音', exact: true });
  const volume = page.getByRole('button', { name: '音量設定' });
  const music = page.getByRole('slider', { name: '音樂音量' });
  const effects = page.getByRole('slider', { name: '音效音量' });

  await page.goto('./');
  await startGame.click();
  await expect.poll(readMasterGain).toBe(1);
  await expect(mute).toHaveAttribute('aria-pressed', 'false', { timeout: 3000 });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(music).toBeHidden();
  await expect.poll(readMasterGain).toBe(0);

  await volume.click();
  const track = await music.boundingBox();
  if (track === null) throw new Error('Missing music slider');
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width * 0.6, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.35, y, { steps: 5 });
  await page.mouse.up();
  const musicLevel = Number(await music.inputValue());
  expect(musicLevel).toBeGreaterThan(25);
  expect(musicLevel).toBeLessThan(45);
  await effects.press('ArrowLeft');
  await expect(effects).toHaveValue('99');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(readMasterGain).toBe(0);

  await page.reload();
  await startGame.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(readMasterGain).toBe(0);
  await volume.click();
  await expect(music).toHaveValue(String(musicLevel));
  await expect(effects).toHaveValue('99');
  await mute.press('Space');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(readMasterGain).toBe(1);
  await expect
    .poll(async () => (await readGains()).gains.map((gain) => Math.round(gain * 100)))
    .toEqual(expect.arrayContaining([musicLevel, 99]));
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
});

test('adjusts both audio levels from the HUD and keeps game controls accessible', async ({
  page,
}) => {
  await page.goto('./');
  const startGame = page.getByRole('button', { name: '開始遊戲' });
  await startGame.click();
  await page.getByLabel('Crownfall 關卡').click({ position: openTile });
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
  for (const other of [ring, waves]) {
    const overlap =
      panel.x < other.x + other.width &&
      panel.x + panel.width > other.x &&
      panel.y < other.y + other.height &&
      panel.y + panel.height > other.y;
    expect(overlap).toBe(false);
  }

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
  await expect(volume).toBeFocused();
  await expect(buildRing).toBeVisible();

  await volume.press('Space');
  await expect(music).toBeVisible();
  await buildRing.getByRole('button', { name: /弓箭塔/ }).press('Escape');
  await expect(music).toBeHidden();
  await expect(volume).toBeFocused();
  await expect(buildRing).toBeVisible();

  await page.reload();
  await startGame.click();
  await volume.click();
  await expect(music).toHaveValue('59');
  await expect(effects).toHaveValue(String(effectsLevel));
});

test('the wave controls work while the audio panel is open and toggling it preserves time settings', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const volume = page.getByRole('button', { name: '音量設定' });
  const music = page.getByRole('slider', { name: '音樂音量' });
  const waves = page.getByRole('region', { name: '波次與時間控制' });
  const startWave = waves.getByRole('button', { name: /開波/ });
  const pause = waves.getByRole('button', { name: '暫停', exact: true });
  const resume = waves.getByRole('button', { name: '繼續', exact: true });
  const speed = waves.getByRole('button', { name: /切換倍速/ });

  await volume.click();
  await expect(music).toBeVisible();
  await speed.click();
  await expect(speed).toHaveText('2×');
  await expect(music).toBeHidden();

  await volume.click();
  await expect(music).toBeVisible();
  await startWave.click();
  await expect(startWave).toBeDisabled();
  await expect(music).toBeHidden();

  await volume.click();
  await expect(music).toBeVisible();
  await volume.click();
  await expect(music).toBeHidden();
  await expect(pause).toBeVisible();
  await expect(speed).toHaveText('2×');

  await volume.click();
  await expect(music).toBeVisible();
  await pause.click();
  await expect(resume).toBeVisible();
  await expect(music).toBeHidden();
  await volume.press('Enter');
  await expect(music).toBeVisible();
  await volume.press('Enter');
  await expect(music).toBeHidden();
  await expect(resume).toBeVisible();
  await expect(speed).toHaveText('2×');
});

test('the board click that dismisses volume settings leaves the build selection unchanged', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const volume = page.getByRole('button', { name: '音量設定' });
  const music = page.getByRole('slider', { name: '音樂音量' });
  const buildRing = page.getByRole('region', { name: '建造環' });
  const board = page.getByLabel('Crownfall 關卡');
  const buildable = { position: openTile };

  await volume.click();
  await expect(music).toBeVisible();
  await board.click(buildable);
  await expect(music).toBeHidden();
  await expect(buildRing).toBeHidden();
  await board.click(buildable);
  await expect(buildRing).toBeVisible();

  await volume.click();
  await board.click(buildable);
  await expect(music).toBeHidden();
  await expect(buildRing).toBeVisible();

  const lane = page.getByRole('button', { name: '路障示範格' });
  const archer = buildRing.getByRole('button', { name: /弓箭塔/ });
  const detour = page.getByText('路線 +2 格', { exact: true });
  await volume.click();
  await lane.click();
  await expect(music).toBeHidden();
  await archer.hover();
  await expect(detour).toBeHidden();
  await lane.click();
  await archer.hover();
  await expect(detour).toBeVisible();
});

test('keeps keyboard and pointer volume controls available in the defeat dialog', async ({
  page,
}) => {
  test.slow();
  await accelerateWaves(page);

  await page.goto('./');
  await page.getByRole('button', { name: '開始遊戲' }).click();
  const openWave = page.getByRole('button', { name: /開波/ });
  await openWave.click();
  await expect(openWave).toBeDisabled();
  await openWave.click({ timeout: 25000 });

  const result = page.getByRole('dialog', { name: '敗北' });
  await expect(result).toBeVisible({ timeout: 25000 });
  const mute = result.getByRole('button', { name: '靜音', exact: true });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.readAudioGains().master)).toBe(0);

  await result.getByRole('button', { name: '音量設定' }).press('Space');
  const music = result.getByRole('slider', { name: '音樂音量' });
  await music.press('ArrowLeft');
  await expect(music).toHaveValue('59');
  await music.press('Escape');
  await expect(music).toBeHidden();

  await result.getByRole('button', { name: '重新開始' }).click();
  const help = page.getByRole('dialog', { name: '操作說明' });
  const helpMute = help.getByRole('button', { name: '靜音', exact: true });
  await expect(helpMute).toHaveAttribute('aria-pressed', 'true');
  await helpMute.press('Space');
  await expect.poll(() => page.evaluate(() => window.readAudioGains().master)).toBe(1);
  await help.getByRole('button', { name: '音量設定' }).click();
  await expect(help.getByRole('slider', { name: '音樂音量' })).toHaveValue('59');
  await help.getByRole('slider', { name: '音樂音量' }).press('Escape');
  await help.getByRole('button', { name: '開始遊戲' }).click();
  await expect(page.getByRole('button', { name: '靜音', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
