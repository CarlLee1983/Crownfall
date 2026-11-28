import { type GameState, queryWave } from '../core';

export type MusicTrack = 'preparation' | 'wave' | 'lich' | 'defeat';

export type MusicCommand =
  | { readonly kind: 'music'; readonly track: MusicTrack }
  | { readonly kind: 'stopMusic' };

export function musicForPhase(state: GameState): MusicCommand {
  if (state.phase === 'victory') return { kind: 'stopMusic' };
  if (state.phase === 'defeat') return { kind: 'music', track: 'defeat' };
  if (state.phase !== 'wave') return { kind: 'music', track: 'preparation' };
  const wave = queryWave(state, state.waveNumber);
  const includesLich = wave?.groups.some(({ enemy }) => enemy === 'boss');
  return { kind: 'music', track: includesLich ? 'lich' : 'wave' };
}
