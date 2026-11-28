import { describe, expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/ramp-level.fixture';
import { cellPoint, createGame } from '../core';
import { runCampaign, runWave } from './simulation';

it('builds on every cell of the platform beside the lower lane', () => {
  const initial = createGame({ ...content, startingMoney: 2000, waves: [{ groups: [] }] }, level);

  const result = runWave(initial, 'platform');

  const placements = result.towers
    .map(({ cell }) => cell)
    .sort((a, b) => a - b)
    .map((cell) => cellPoint(level, cell));
  expect(placements).toEqual([2, 3, 4, 5].map((x) => ({ x, y: 4 })));
});

describe('original ramp campaign balance', () => {
  it('rewards the reference strategy over either pure strategy across the campaign', () => {
    const initial = createGame(content, level);
    const results = {
      reference: runCampaign(initial, 'reference').state.phase,
      platform: runCampaign(initial, 'platform').state.phase,
      roadblock: runCampaign(initial, 'roadblock').state.phase,
    };

    expect(results).toEqual({ reference: 'victory', platform: 'defeat', roadblock: 'defeat' });
  });

  it('gives both placements a wave with fewer lives lost in the opening three waves', () => {
    const initial = createGame(content, level);
    const { beforeWaves } = runCampaign(initial, 'reference');
    const forks = beforeWaves.map((state) => {
      const platform = runWave(state, 'platform');
      const roadblock = runWave(state, 'roadblock');
      const wave = state.waveNumber + 1;
      for (const [strategy, result] of Object.entries({ platform, roadblock })) {
        expect(['preparation', 'victory'], `Wave ${wave} ${strategy} fork`).toContain(result.phase);
      }
      return {
        wave,
        platform: state.lives - platform.lives,
        roadblock: state.lives - roadblock.lives,
      };
    });

    expect(forks.map(({ wave }) => wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const opening = forks.slice(0, 3);
    expect(
      opening.some(({ platform, roadblock }) => platform < roadblock),
      JSON.stringify(forks),
    ).toBe(true);
    expect(
      opening.some(({ platform, roadblock }) => roadblock < platform),
      JSON.stringify(forks),
    ).toBe(true);
    expect(forks.every(({ platform, roadblock }) => platform < roadblock)).toBe(false);
    expect(forks.every(({ platform, roadblock }) => roadblock < platform)).toBe(false);
  });
});
