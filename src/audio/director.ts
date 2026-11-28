import type { Command, EnemyId, GameEvent, GameState } from '../core';
import { type MusicCommand, musicForPhase } from './music-director';

export type SoundId =
  | 'war-horns'
  | 'longbow-soft'
  | 'crossbow-1'
  | 'archer-hit-soft'
  | 'ballista-hit-plate'
  | 'spell-fire-2'
  | 'bone-break-3'
  | 'lich-shade-1'
  | 'leak-bell'
  | 'jingle-steel-10'
  | 'jingle-steel-02'
  | 'place-plank'
  | 'upgrade-stone'
  | 'sell-wood'
  | 'ui-error-03';

export type EffectCommand = {
  readonly kind: 'effect';
  readonly sound: SoundId;
  readonly bus: 'effects' | 'ui';
  readonly pitchSemitones: number;
  readonly duck: boolean;
  /** Let the music recover between repeated alerts even when their sounds overlap. */
  readonly duckRecoverySeconds?: number;
  readonly discardWhenLate?: true;
  /** Drop the cue while the same sound still rings, so a run of alerts never restarts it. */
  readonly skipWhileSounding?: true;
};

export type SoundCommand = EffectCommand | MusicCommand;

export function directInitialSound(state: GameState): readonly SoundCommand[] {
  return [musicForPhase(state)];
}

interface HitTarget {
  readonly id: EnemyId;
  readonly kind: string;
}

export interface HitPresentation {
  readonly towerKind: string;
  readonly target: HitTarget;
  readonly lethal: boolean;
  readonly splashKills?: readonly HitTarget[];
}

function effect(sound: SoundId, pitchSemitones = 0, duck = false): EffectCommand {
  return { kind: 'effect', sound, bus: 'effects', pitchSemitones, duck };
}

function uiEffect(sound: SoundId): EffectCommand {
  return { kind: 'effect', sound, bus: 'ui', pitchSemitones: 0, duck: false };
}

function combatEffect(sound: SoundId, pitchSemitones = 0): EffectCommand {
  return { ...effect(sound, pitchSemitones), discardWhenLate: true };
}

function deathSound(kind: string): EffectCommand | undefined {
  switch (kind) {
    case 'grunt':
      return combatEffect('bone-break-3');
    case 'runner':
      return combatEffect('bone-break-3', 2);
    case 'tank':
      return combatEffect('bone-break-3', -4);
    case 'boss':
      return combatEffect('lich-shade-1');
  }
}

export function directCommandSound(
  command: Command,
  events: readonly GameEvent[],
): EffectCommand | undefined {
  // Each core command either applies successfully or emits a rejection event.
  if (events.length > 0) return uiEffect('ui-error-03');
  switch (command.type) {
    case 'startWave':
      return effect('war-horns', 0, true);
    case 'placeTower':
      return uiEffect('place-plank');
    case 'upgradeTower':
      return uiEffect('upgrade-stone');
    case 'sellTower':
      return uiEffect('sell-wood');
  }
}

const towerSounds: Readonly<
  Record<string, { readonly fire?: SoundId; readonly impact: SoundId } | undefined>
> = {
  basic: { fire: 'longbow-soft', impact: 'archer-hit-soft' },
  sniper: { fire: 'crossbow-1', impact: 'ballista-hit-plate' },
  splash: { impact: 'spell-fire-2' },
};

export function directSound(
  events: readonly GameEvent[],
  previous: GameState,
  current: GameState,
): readonly SoundCommand[] {
  const commands: SoundCommand[] = [];
  const wonThisTick = events.some(({ type }) => type === 'victory');
  for (const event of events) {
    switch (event.type) {
      case 'shot': {
        const fire = towerSounds[event.towerKind]?.fire;
        if (fire !== undefined) commands.push(combatEffect(fire));
        break;
      }
      case 'leaked':
        commands.push({
          ...effect('leak-bell', 0, true),
          duckRecoverySeconds: 0.4,
          skipWhileSounding: true,
        });
        break;
      case 'waveCleared':
        if (!wonThisTick) commands.push(effect('jingle-steel-10'));
        break;
      case 'victory':
        commands.push(effect('jingle-steel-02', 0, true));
        break;
    }
  }

  if (current.phase !== previous.phase) commands.push(musicForPhase(current));
  return commands;
}

export function directImpact(hit: HitPresentation): readonly EffectCommand[] {
  const commands: EffectCommand[] = [];
  const impact = towerSounds[hit.towerKind]?.impact;
  if (impact !== undefined) commands.push(combatEffect(impact));
  if (hit.lethal) {
    const death = deathSound(hit.target.kind);
    if (death !== undefined) commands.push(death);
  }
  for (const victim of hit.splashKills ?? []) {
    const death = deathSound(victim.kind);
    if (death !== undefined) commands.push(death);
  }
  return commands;
}
