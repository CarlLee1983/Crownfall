import { content } from '../content/content';
import { level } from '../content/level';
import {
  applyCommands,
  type Command,
  createGame,
  type GameEvent,
  type GameState,
  queryTower,
  step,
  TICKS_PER_SECOND,
} from '../core';
import { cellIndex } from '../core/level';
import { element, updateText } from '../render/hud-dom';

if (import.meta.env.DEV) void import('./hit-demo.css');

const DEMO_START_TICK = 8 * TICKS_PER_SECOND;
const ARCHER = cellIndex(level.width, 3, 4);
const demoContent = {
  ...content,
  startingMoney: 230,
  waves: [
    {
      groups: [
        { enemy: 'runner', count: 18, interval: 0.29, delay: 0 },
        { enemy: 'grunt', count: 14, interval: 0.34, delay: 0 },
      ],
    },
  ],
} satisfies typeof content;

const setupCommands: readonly Command[] = [
  { type: 'placeTower', kind: 'basic', cell: ARCHER, tick: 0 },
  { type: 'placeTower', kind: 'sniper', cell: cellIndex(level.width, 5, 3), tick: 0 },
  { type: 'placeTower', kind: 'splash', cell: cellIndex(level.width, 4, 6), tick: 0 },
  { type: 'startWave', tick: 0 },
];

export function createDemoState(): GameState {
  const setup = applyCommands(createGame(demoContent, level), setupCommands);
  if (setup.events.length > 0) throw new Error('命中回饋原型無法開始固定戰鬥');
  let state = setup.state;
  // 讓敵群先前進到交戰區附近，重播後不用等待走完整段車道。
  for (let tick = 0; tick < DEMO_START_TICK; tick++) state = step(state, []).state;
  if (state.phase !== 'wave') throw new Error('固定戰鬥在原型開始前已結束');
  return state;
}

export function demoRangePreview(state: GameState) {
  const archer = queryTower(state, ARCHER);
  return archer === null ? undefined : { cell: ARCHER, range: archer.range };
}

export type HitVariant = 'A' | 'B' | 'C';

const variants = [
  { key: 'A', label: '節制', details: '短閃白、少量碎片和輕微城堡閃光。' },
  { key: 'B', label: '重點', details: '重擊有停頓、後仰。擊殺與漏怪時短暫震動。' },
  { key: 'C', label: '強烈', details: '每次命中都有停頓，閃白、碎片與震動更強。' },
] as const;

export function readHitVariant(search: string): HitVariant | undefined {
  const value = new URLSearchParams(search).get('variant')?.toUpperCase();
  return variants.find(({ key }) => key === value)?.key;
}

interface DemoActions {
  readonly replay: () => void;
  readonly setSpeed: (speed: number) => void;
}

export function mountHitDemo(initial: HitVariant, actions: DemoActions) {
  const originalHud = element('game-hud');
  originalHud.style.display = 'none';
  const panel = document.createElement('section');
  panel.id = 'hit-demo';
  panel.setAttribute('aria-labelledby', 'hit-demo-title');
  panel.innerHTML = `
    <h1 id="hit-demo-title">命中回饋原型</h1>
    <div id="hit-demo-variants" class="hit-demo-buttons" role="group" aria-label="回饋版本"></div>
    <p id="hit-demo-details" role="status"></p>
    <p>白圈標示弓箭塔射程</p>
    <p id="hit-demo-stats"></p>
    <div class="hit-demo-buttons">
      <button type="button" id="hit-demo-replay" aria-keyshortcuts="Alt+R">重播 <kbd>Alt+R</kbd></button>
      <button type="button" id="hit-demo-pause" aria-keyshortcuts="Alt+P" aria-pressed="false">暫停 <kbd>Alt+P</kbd></button>
    </div>
  `;
  originalHud.after(panel);
  const buttonGroup = element('hit-demo-variants');
  const details = element('hit-demo-details');
  const stats = element('hit-demo-stats');
  const replay = element('hit-demo-replay');
  const pause = element('hit-demo-pause');
  let leaks = 0;
  let paused = false;

  const setPaused = (next: boolean): void => {
    paused = next;
    pause.setAttribute('aria-pressed', String(paused));
    actions.setSpeed(paused ? 0 : 1);
  };

  const buttons = variants.map(({ key, label }, index) => {
    const button = document.createElement('button');
    const shortcut = `Alt+${index + 1}`;
    button.type = 'button';
    button.setAttribute('aria-keyshortcuts', shortcut);
    button.append(`${key} ${label} `);
    const hint = document.createElement('kbd');
    hint.textContent = shortcut;
    button.append(hint);
    button.addEventListener('click', () => select(key));
    buttonGroup.append(button);
    return { key, button };
  });

  function select(variant: HitVariant, updateUrl = true): void {
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant);
      window.history.replaceState(window.history.state, '', url);
    }
    for (const { key, button } of buttons)
      button.setAttribute('aria-pressed', String(key === variant));
    const selected = variants.find(({ key }) => key === variant);
    if (selected) updateText(details, selected.details);
  }

  buttonGroup.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = buttons.findIndex(({ button }) => button === event.target);
    if (index === -1) return;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const next = buttons[(index + buttons.length + direction) % buttons.length];
    if (next === undefined) return;
    event.preventDefault();
    next.button.focus();
    next.button.click();
  });
  select(initial, false);
  requestAnimationFrame(() => buttons.find(({ key }) => key === initial)?.button.focus());
  replay.addEventListener('click', () => {
    actions.replay();
    setPaused(false);
    leaks = 0;
  });
  pause.addEventListener('click', () => setPaused(!paused));

  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    const variantButton = {
      Digit1: buttons[0]?.button,
      Digit2: buttons[1]?.button,
      Digit3: buttons[2]?.button,
    }[event.code];
    const button =
      variantButton ??
      {
        KeyR: replay,
        KeyP: pause,
      }[event.code];
    if (button === undefined) return;
    event.preventDefault();
    variantButton?.focus();
    button.click();
  });

  return {
    onEvents(events: readonly GameEvent[]): void {
      for (const event of events) {
        if (event.type === 'leaked') leaks++;
      }
    },
    update(state: GameState, kills: number): void {
      const seconds = Math.floor((state.tick - DEMO_START_TICK) / TICKS_PER_SECOND);
      const elapsed = state.phase === 'wave' ? `${seconds} 秒` : '波次結束';
      updateText(stats, `${elapsed} · 擊殺 ${kills} · 漏怪 ${leaks} · 生命 ${state.lives}`);
    },
  };
}
