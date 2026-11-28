import type { EnemyId, GameEvent, GameState } from '../core';

export type SoundId =
  | 'war-horns'
  | 'longbow-soft'
  | 'crossbow-1'
  | 'archer-hit-soft'
  | 'ballista-hit-plate'
  | 'spell-fire-2'
  | 'bone-break-3'
  | 'lich-shade-1';

export type EffectCommand = {
  readonly kind: 'effect';
  readonly sound: SoundId;
  readonly bus: 'effects' | 'ui';
  readonly pitchSemitones: number;
  readonly duck: boolean;
};

export type SoundCommand = EffectCommand;

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

function deathSound(kind: string): EffectCommand | undefined {
  switch (kind) {
    case 'grunt':
      return effect('bone-break-3');
    case 'runner':
      return effect('bone-break-3', 2);
    case 'tank':
      return effect('bone-break-3', -4);
    case 'boss':
      return effect('lich-shade-1');
  }
}

export function directSound(
  events: readonly GameEvent[],
  previous: GameState,
  current: GameState,
  hits: readonly HitPresentation[] = [],
): readonly SoundCommand[] {
  const commands: SoundCommand[] = [];

  // A successful startWave increments the wave number even if the wave ends in the same tick.
  if (current.waveNumber > previous.waveNumber) commands.push(effect('war-horns', 0, true));

  for (const event of events) {
    if (event.type !== 'shot') continue;
    const tower = current.towers.find(({ cell }) => cell === event.towerCell);
    if (tower?.kind === 'basic') commands.push(effect('longbow-soft'));
    if (tower?.kind === 'sniper') commands.push(effect('crossbow-1'));
  }

  for (const hit of hits) {
    switch (hit.towerKind) {
      case 'basic':
        commands.push(effect('archer-hit-soft'));
        break;
      case 'sniper':
        commands.push(effect('ballista-hit-plate'));
        break;
      case 'splash':
        commands.push(effect('spell-fire-2'));
        break;
    }
    if (hit.lethal) {
      const death = deathSound(hit.target.kind);
      if (death !== undefined) commands.push(death);
    }
    for (const victim of hit.splashKills ?? []) {
      const death = deathSound(victim.kind);
      if (death !== undefined) commands.push(death);
    }
  }

  return commands;
}
