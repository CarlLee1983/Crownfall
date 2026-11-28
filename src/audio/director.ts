import type { GameEvent, GameState } from '../core';
import { type MusicCommand, musicForPhase } from './music-director';

export type SoundId = 'war-horns';

export type EffectCommand = {
  readonly kind: 'effect';
  readonly sound: SoundId;
  readonly bus: 'effects' | 'ui';
  readonly pitchSemitones: number;
  readonly duck: boolean;
};

export type SoundCommand = EffectCommand | MusicCommand;

export function directInitialSound(state: GameState): readonly SoundCommand[] {
  return [musicForPhase(state)];
}

export function directSound(
  _events: readonly GameEvent[],
  previous: GameState,
  current: GameState,
): readonly SoundCommand[] {
  const commands: SoundCommand[] = [];
  // A successful startWave increments the wave number even if the wave ends in the same tick.
  if (current.waveNumber > previous.waveNumber) {
    commands.push({
      kind: 'effect',
      sound: 'war-horns',
      bus: 'effects',
      pitchSemitones: 0,
      duck: true,
    });
  }
  if (current.phase !== previous.phase) commands.push(musicForPhase(current));
  return commands;
}
