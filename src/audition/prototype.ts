import type { GameEvent, GameState } from '../core';
import { music, sadBattle } from './music';
import { createPanel } from './panel';
import { Player } from './player';
import { sounds } from './sounds';

const musicKeys = ['prep', 'wave', 'boss'];
const uiKeys = ['placeTower', 'upgradeTower', 'sellTower', 'rejected'];
const duckKeys = ['startWave', 'leaked', 'victory', 'defeat'];

export function createAudition() {
  const groups = {
    ...sounds,
    defeat: [...(sounds.defeat ?? []), sadBattle],
    prep: music,
    wave: music.slice(1).concat(music.slice(0, 1)),
    boss: music.slice(2).concat(music.slice(0, 2)),
  };
  let phaseTrack: string | null = 'prep';
  let previewTrack: string | null = null;
  let started = false;
  const player = new Player((message) => panel.status(message));
  const playMusic = (nearEnd = false) => {
    const key = previewTrack ?? phaseTrack;
    player.music(key ? panel.selected(key).url : null, nearEnd);
  };
  const effect = (key: string, pitch = 0) => {
    player.effect(
      key,
      panel.selected(key).url,
      uiKeys.includes(key) ? 'ui' : 'effects',
      duckKeys.includes(key),
      pitch,
    );
  };
  const panel = createPanel(
    groups,
    (key) => {
      if (started && key === (previewTrack ?? phaseTrack)) playMusic();
    },
    (key, nearEnd) => {
      player.stopEffects();
      if (key === 'resume' || musicKeys.includes(key)) {
        previewTrack = key === 'resume' ? null : key;
        playMusic(nearEnd);
      } else {
        effect(key);
      }
    },
    (bus, value) => player.volume(bus, value),
    (db) => player.duckDepth(db),
  );
  return {
    start() {
      if (started) return;
      started = true;
      player
        .unlock()
        .then(() => playMusic())
        .catch(() => {
          started = false;
          panel.status('無法啟動音訊，請重新整理後再試一次。');
        });
    },
    pause: (paused: boolean) => player.pause(paused),
    reset() {
      player.reset();
      previewTrack = null;
      phaseTrack = 'prep';
      if (started) playMusic();
    },
    observe(events: readonly GameEvent[], before: GameState, state: GameState) {
      if (!started) return;
      if (before.phase !== state.phase || before.waveNumber !== state.waveNumber) {
        phaseTrack = state.phase === 'preparation' ? 'prep' : null;
        if (state.phase === 'wave') {
          phaseTrack = state.waveNumber === state.waves.length ? 'boss' : 'wave';
          effect('startWave');
        }
        previewTrack = null;
        playMusic();
      }
      if (before.towers !== state.towers) {
        for (const tower of state.towers) {
          const old = before.towers.find((prior) => prior.cell === tower.cell);
          if (!old) effect('placeTower');
          else if (old.level !== tower.level) effect('upgradeTower');
        }
        if (before.towers.length > state.towers.length) effect('sellTower');
      }
      for (const event of events) {
        if (event.type === 'shot') {
          const kind = state.towers.find((tower) => tower.cell === event.towerCell)?.kind;
          if (kind === 'splash') effect('mage');
          if (kind === 'sniper' || kind === 'basic') {
            const key = kind === 'basic' ? 'archer' : 'ballista';
            effect(key);
            effect(`${key}Hit`);
          }
        } else if (event.type === 'killed') {
          effect(
            event.enemyKind === 'boss' ? 'lich' : 'killed',
            event.enemyKind === 'tank' ? -4 : event.enemyKind === 'runner' ? 2 : 0,
          );
        } else if (event.type === 'waveRejected' || event.type === 'continueRejected') {
          effect('rejected');
        } else if (event.type !== 'waveCleared' || state.phase !== 'victory') {
          effect(event.type);
        }
      }
    },
  };
}
