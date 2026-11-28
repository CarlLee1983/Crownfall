import type { Camera } from 'three';
import {
  cellAt,
  continueRejection,
  type GameEvent,
  type GameState,
  queryWave,
  waveStartRejection,
} from '../core';
import { neighbors } from '../core/level';
import { cellProjection, element, isGameDialogOpen, updateText } from './hud-dom';
import { createSurveyUrl, PLAYTEST_SURVEY_URL_TEMPLATE } from './survey';

const ENEMY_NAMES: Readonly<Record<string, string>> = {
  grunt: '骷髏兵',
  runner: '食屍鬼',
  tank: '骷髏騎士',
  boss: '巫妖',
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
  continueEndless(): void;
  setSpeed(speed: number): void;
  restart(): void;
}

function previewText(state: GameState): string {
  if (state.phase === 'wave') {
    return `剩餘敵人 ${state.pendingSpawns.length + state.enemies.length}`;
  }
  const next = queryWave(state, state.waveNumber + 1);
  if (next === undefined) return '沒有下一波';
  const composition = next.groups
    .map(({ enemy, count }) => `${ENEMY_NAMES[enemy] ?? enemy} ×${count}`)
    .join('、');
  return state.endless ? `${composition}，血量 ×${next.hpMultiplier.toFixed(2)}` : composition;
}

export function createWaveHud(canvas: HTMLCanvasElement, camera: Camera, actions: WaveActions) {
  element('game-version').textContent = `版本 ${__APP_VERSION__}`;
  const lives = element('game-lives');
  const waveNumber = element('wave-number');
  const flag = element('wave-flag');
  const preview = element('wave-preview');
  const start = element('start-wave');
  const pause = element('pause');
  const speedControl = element('speed');
  const feedback = element('wave-feedback');
  const help = element('game-help');
  const result = element('game-result');
  const resultTitle = element('result-title');
  const resultDetail = element('result-detail');
  const continueButton = element('continue-endless');
  if (
    !(help instanceof HTMLDialogElement) ||
    !(result instanceof HTMLDialogElement) ||
    !(start instanceof HTMLButtonElement)
  ) {
    throw new Error('遊戲控制項的 HTML 元素類型錯誤');
  }

  const surveyLink = document.createElement('a');
  surveyLink.id = 'playtest-survey';
  surveyLink.target = '_blank';
  surveyLink.rel = 'noopener';
  surveyLink.textContent = '填寫試玩問卷';

  const projectCell = cellProjection(camera);
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
  continueButton.addEventListener('click', actions.continueEndless);
  result.addEventListener('cancel', (event) => event.preventDefault());
  result.addEventListener('submit', (event) => {
    event.preventDefault();
    paused = false;
    speed = 1;
    notices.clear();
    feedback.textContent = '';
    actions.restart();
    syncSpeed();
    result.close();
    help.showModal();
  });

  document.addEventListener('keydown', (event) => {
    if (
      isGameDialogOpen() ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;

    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    if (event.repeat) return;
    if (key === 'n') {
      event.preventDefault();
      actions.startWave();
    } else if (key === 'f') {
      event.preventDefault();
      cycleSpeed();
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
    update(state: GameState, now: number, resultReady: boolean): void {
      updateText(lives, String(state.lives));
      const displayedWave =
        state.endless && state.phase === 'preparation' ? state.waveNumber + 1 : state.waveNumber;
      const waveLabel = `第 ${displayedWave} 波${state.endless ? '（無盡）' : ''}`;
      updateText(
        waveNumber,
        state.endless ? waveLabel : `第 ${state.waveNumber} / ${state.waves.length} 波`,
      );
      start.disabled = waveStartRejection(state) !== undefined;

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
        if (result.open || !resultReady) return;
        continueButton.hidden = continueRejection(state) !== undefined;
        const outcome = state.phase === 'victory' ? '勝利' : '敗北';
        updateText(resultTitle, outcome);
        if (state.phase === 'victory') {
          updateText(resultDetail, `剩餘生命 ${state.lives}`);
        } else {
          const reason =
            state.defeatReason === 'bossLeaked' ? `${ENEMY_NAMES.boss}抵達城堡` : '生命歸零';
          updateText(resultDetail, `${reason}，撐到${waveLabel}`);
        }
        surveyLink.href = createSurveyUrl(
          PLAYTEST_SURVEY_URL_TEMPLATE,
          __APP_VERSION__,
          outcome,
          displayedWave,
        );
        result.append(surveyLink);
        result.showModal();
        return;
      }

      if (result.open) result.close();
      updateText(preview, previewText(state));

      const { level } = state;
      const flagCell = neighbors(level, level.spawn).find(
        ({ index }) => !cellAt(level, index).lane,
      );
      const point = projectCell(
        level,
        flagCell?.index ?? level.spawn,
        canvas.getBoundingClientRect(),
      );
      flag.hidden = point === undefined;
      if (point === undefined) return;
      flag.style.left = `${point.x}px`;
      flag.style.top = `${point.y}px`;
    },
  };
}
