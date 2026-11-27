import { expect, it } from 'vitest';
import { content } from '../content/content';
import { createGame, type GameState, parseLevel, step } from '../core';
import { createSurveyUrl } from './survey';

const template =
  'https://example.invalid/viewform?usp=pp_url&entry.100={version}&entry.200={result}&entry.300={wave}';

function runCampaign(startingLives: number): GameState {
  const waves = Array.from({ length: 10 }, (_, index) => ({
    groups: index === 3 ? [{ enemy: 'grunt', count: 1, interval: 0, delay: 0 }] : [],
  }));
  let state = createGame({ ...content, waves, startingLives }, parseLevel(['SG']));
  while (state.phase === 'preparation') state = playWave(state);
  return state;
}

function playWave(before: GameState): GameState {
  let { state } = step(before, [{ type: 'startWave', tick: before.tick }]);
  for (let ticks = 0; ticks < 60 && state.phase === 'wave'; ticks++) {
    state = step(state, []).state;
  }
  return state;
}

it('prefills the version, defeat, and wave reached', () => {
  const lost = runCampaign(1);
  expect(lost.phase).toBe('defeat');
  expect(createSurveyUrl(template, 'v0.1.0', '敗北', lost.waveNumber)).toBe(
    'https://example.invalid/viewform?usp=pp_url&entry.100=v0.1.0&entry.200=%E6%95%97%E5%8C%97&entry.300=4',
  );
});

it('prefills victory with the total number of campaign waves', () => {
  const won = runCampaign(2);
  expect(won.phase).toBe('victory');
  expect(createSurveyUrl(template, 'v0.1.0', '勝利', won.waveNumber)).toBe(
    'https://example.invalid/viewform?usp=pp_url&entry.100=v0.1.0&entry.200=%E5%8B%9D%E5%88%A9&entry.300=10',
  );
});

it('prefills the wave reached in endless mode', () => {
  const won = runCampaign(2);
  const { state } = step(won, [{ type: 'continueEndless', tick: won.tick }]);
  const lost = playWave(state);
  expect(lost).toMatchObject({ phase: 'defeat', endless: true });
  expect(createSurveyUrl(template, 'dev', '敗北', lost.waveNumber)).toBe(
    'https://example.invalid/viewform?usp=pp_url&entry.100=dev&entry.200=%E6%95%97%E5%8C%97&entry.300=11',
  );
});

it('encodes spaces, Chinese characters, and URL delimiters in prefilled values', () => {
  expect(createSurveyUrl(template, 'dev 中文 &+=#%', '勝利 / 無盡', 12)).toBe(
    'https://example.invalid/viewform?usp=pp_url&entry.100=dev%20%E4%B8%AD%E6%96%87%20%26%2B%3D%23%25&entry.200=%E5%8B%9D%E5%88%A9%20%2F%20%E7%84%A1%E7%9B%A1&entry.300=12',
  );
});
