import { type GameState, step, TICKS_PER_SECOND } from '../core';
import { build, type Strategy } from './strategy';

const MAX_WAVE_TICKS = 5 * 60 * TICKS_PER_SECOND;

export function runWave(beforeSpending: GameState, strategy: Strategy): GameState {
  const prepared = build(beforeSpending, strategy);
  let { state } = step(prepared, [{ type: 'startWave', tick: prepared.tick }]);
  if (state.waveNumber !== prepared.waveNumber + 1) {
    throw new Error(`Balance simulation could not start wave ${prepared.waveNumber + 1}`);
  }
  for (let ticks = 1; ticks < MAX_WAVE_TICKS && state.phase === 'wave'; ticks++) {
    state = step(state, []).state;
  }
  if (state.phase === 'wave') {
    throw new Error(`Balance simulation timed out during wave ${state.waveNumber}`);
  }
  return state;
}

export function runCampaign(initial: GameState, strategy: Strategy) {
  let state = initial;
  const beforeWaves: GameState[] = [];
  while (state.phase === 'preparation') {
    beforeWaves.push(state);
    state = runWave(state, strategy);
  }
  return { state, beforeWaves };
}
