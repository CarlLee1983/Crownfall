import type { Camera } from 'three';
import type { Content, GameEvent, GameState } from '../core';
import { cellProjection, element, updateText } from './hud-dom';

const ENEMY_NAMES: Readonly<Record<string, string>> = {
  grunt: '雜兵',
  runner: '快兵',
  tank: '坦克',
  boss: 'Boss',
};

const WAVE_REJECTIONS = {
  wrongTick: '開波時機已過',
  waveInProgress: '請等這一波結束',
  noNextWave: '沒有下一波',
  gameOver: '遊戲已結束',
};

const NOTICE_MS = 3000;

interface WaveActions {
  startWave(): void;
  setSpeed(speed: number): void;
  restart(): void;
}

export function createWaveHud(
  canvas: HTMLCanvasElement,
  camera: Camera,
  waves: Content['waves'],
  actions: WaveActions,
) {
  const lives = element('game-lives');
  const waveNumber = element('wave-number');
  const flag = element('wave-flag');
  const preview = element('wave-preview');
  const start = element('start-wave');
  const pause = element('pause');
  const speedControl = element('speed');
  const feedback = element('wave-feedback');
  const result = element('game-result');
  const resultTitle = element('result-title');
  const resultDetail = element('result-detail');
  if (!(result instanceof HTMLDialogElement) || !(start instanceof HTMLButtonElement)) {
    throw new Error('遊戲控制項的 HTML 元素類型錯誤');
  }

  const projectCell = cellProjection(camera);
  const previewTexts = waves.map(({ groups }) =>
    groups.map(({ enemy, count }) => `${ENEMY_NAMES[enemy] ?? enemy} ×${count}`).join('、'),
  );
  const notices = new Map<string, { count: number; until: number }>();
  let paused = false;
  let speed = 1;

  const syncSpeed = (): void => {
    actions.setSpeed(paused ? 0 : speed);
    updateText(pause, paused ? '繼續' : '暫停');
    updateText(speedControl, `${speed}×`);
    speedControl.setAttribute('aria-label', `切換倍速，目前 ${speed}×`);
  };

  const togglePause = (): void => {
    paused = !paused;
    syncSpeed();
  };

  const cycleSpeed = (): void => {
    speed = (speed % 3) + 1;
    syncSpeed();
  };

  const showNotice = (text: string, now: number): void => {
    const prior = notices.get(text);
    notices.set(text, { count: prior === undefined ? 1 : prior.count + 1, until: now + NOTICE_MS });
  };

  start.addEventListener('click', actions.startWave);
  pause.addEventListener('click', togglePause);
  speedControl.addEventListener('click', cycleSpeed);
  result.addEventListener('cancel', (event) => event.preventDefault());
  result.addEventListener('submit', () => {
    paused = false;
    speed = 1;
    notices.clear();
    feedback.textContent = '';
    actions.restart();
    syncSpeed();
  });

  document.addEventListener('keydown', (event) => {
    if (
      result.open ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;

    const key = event.key.toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      actions.startWave();
    } else if (key === 'f') {
      event.preventDefault();
      cycleSpeed();
    } else if (key === ' ') {
      if (event.target instanceof HTMLButtonElement && event.target.matches(':focus-visible'))
        return;
      event.preventDefault();
      togglePause();
    }
  });

  return {
    onEvents(events: readonly GameEvent[], now: number): void {
      for (const event of events) {
        if (event.type === 'waveCleared') showNotice(`清波獎勵 +${event.reward} 金`, now);
        if (event.type === 'waveRejected') showNotice(WAVE_REJECTIONS[event.reason], now);
        if (event.type === 'leaked') {
          const name = ENEMY_NAMES[event.enemyKind] ?? event.enemyKind;
          showNotice(
            event.livesLost > 0 ? `${name}漏怪，生命 −${event.livesLost}` : `${name}漏怪`,
            now,
          );
        }
      }
    },
    update(state: GameState, now: number): void {
      updateText(lives, String(state.lives));
      updateText(waveNumber, `第 ${state.waveNumber} / ${waves.length} 波`);

      for (const [text, notice] of notices) {
        if (now >= notice.until) notices.delete(text);
      }
      updateText(
        feedback,
        [...notices]
          .map(([text, notice]) => (notice.count === 1 ? text : `${text}（×${notice.count}）`))
          .join('\n'),
      );

      if (state.phase === 'victory' || state.phase === 'defeat') {
        flag.hidden = true;
        if (result.open) return;
        if (state.phase === 'victory') {
          updateText(resultTitle, '勝利');
          updateText(resultDetail, `剩餘生命 ${state.lives}`);
        } else {
          updateText(resultTitle, '敗北');
          const reason = state.defeatReason === 'bossLeaked' ? 'Boss 抵達終點' : '生命歸零';
          updateText(resultDetail, `${reason}，撐到第 ${state.waveNumber} 波`);
        }
        result.showModal();
        return;
      }

      const point = projectCell(state.level, state.level.spawn, canvas.getBoundingClientRect());
      flag.hidden = point === undefined;
      if (point === undefined) return;

      const next = previewTexts[state.waveNumber];
      start.disabled = state.phase === 'wave' || next === undefined;
      updateText(
        preview,
        state.phase === 'wave'
          ? `剩餘敵人 ${state.pendingSpawns.length + state.enemies.length}`
          : (next ?? '沒有下一波'),
      );

      const halfWidth = flag.offsetWidth / 2;
      const x = Math.max(8 + halfWidth, Math.min(point.x, window.innerWidth - halfWidth - 8));
      const above = point.y >= flag.offsetHeight + 24;
      flag.classList.toggle('below-entrance', !above);
      flag.style.left = `${x}px`;
      flag.style.top = `${point.y + (above ? -12 : 12)}px`;
    },
  };
}
