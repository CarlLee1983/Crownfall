import type { GameEvent, GameState } from '../core';

export type SoundId = 'war-horns';

export type SoundCommand = {
  readonly kind: 'effect';
  readonly sound: SoundId;
  readonly bus: 'effects' | 'ui';
  readonly pitchSemitones: number;
  readonly duck: boolean;
};

export function directSound(
  _events: readonly GameEvent[],
  previous: GameState,
  current: GameState,
): readonly SoundCommand[] {
  // A successful startWave increments the wave number even if the wave ends in the same tick.
  if (current.waveNumber <= previous.waveNumber) return [];

  return [{ kind: 'effect', sound: 'war-horns', bus: 'effects', pitchSemitones: 0, duck: true }];
}
