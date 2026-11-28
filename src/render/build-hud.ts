import { type Camera, Raycaster, Vector2 } from 'three';
import {
  type CellIndex,
  canAffordTower,
  cellAt,
  currentRoute,
  type GameEvent,
  type GameState,
  pickCell,
  previewPlacement,
  queryTower,
  type RejectionReason,
  type Structure,
  samePlacementPreviewInputs,
  type Tower,
} from '../core';
import { cellProjection, element, isGameDialogOpen, updateText } from './hud-dom';
import { LAYER_HEIGHT } from './terrain';

const REASONS: Record<RejectionReason, string> = {
  insufficientFunds: '金錢不足',
  disconnectedRoute: '會讓入口到終點斷線',
  trappedEnemy: '會困住場上的敵人',
  enemyOnCell: '敵人正在這格或下一步要走這格',
  unbuildableCell: '入口、終點與坡道不能建塔',
  occupiedCell: '這格已經有塔',
  unknownTower: '找不到這種塔',
  wrongTick: '操作時機已過',
  gameOver: '遊戲已結束',
  maxLevel: '這座塔已達滿級',
  noTower: '這格沒有塔',
};
const FEEDBACK_DURATION_MS = 2600;
const EDGE_MARGIN = 8;
const RING_GAP = 24;

type ScreenPoint = { x: number; y: number };
type TowerAction = 'upgradeTower' | 'sellTower';

interface BuildActions {
  placeTower(cell: CellIndex, kind: string): void;
  manageTower(cell: CellIndex, action: TowerAction): void;
}

function towerActionButton(label: string, shortcut: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tower-action';
  button.setAttribute('aria-keyshortcuts', shortcut);
  const key = document.createElement('kbd');
  key.setAttribute('aria-hidden', 'true');
  key.textContent = shortcut;
  const price = document.createElement('span');
  price.className = 'tower-price';
  button.append(`${label} `, key, price);
  return { button, price };
}

function describePreview(state: GameState, cell: CellIndex, kind: string) {
  const preview = previewPlacement(state, cell, kind);
  const route =
    cellAt(state.level, cell).lane && preview.route.length > 0 ? preview.route : undefined;
  const lines: string[] = [];
  if (route !== undefined) lines.push(`路線 +${route.length - currentRoute(state).length} 格`);
  if (preview.heightBonus > 0) lines.push(`對低地射程 +${preview.heightBonus}`);
  if (preview.reason !== undefined) lines.push(REASONS[preview.reason]);
  return {
    text: lines.join('\n'),
    render: { cell, range: preview.rangeAtGround, ...(route === undefined ? {} : { route }) },
  };
}

export function createBuildHud(
  canvas: HTMLCanvasElement,
  camera: Camera,
  initial: GameState,
  actions: BuildActions,
  towerStructure: (tower: Tower) => Structure,
) {
  const ring = element('build-ring');
  const anchor = element('build-anchor');
  const options = element('build-options');
  const detail = element('build-preview');
  const feedback = element('build-feedback');
  const balance = element('build-balance');
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const projectCell = cellProjection(camera);
  const towerPanel = document.createElement('div');
  towerPanel.className = 'tower-panel';
  towerPanel.hidden = true;
  const towerDetails = document.createElement('p');
  towerDetails.id = 'tower-details';
  const upgrade = towerActionButton('升級', 'U');
  const sell = towerActionButton('賣出', 'S');
  const upgradeTarget = document.createElement('span');
  upgradeTarget.className = 'tower-upgrade';
  upgradeTarget.append(upgrade.button);
  towerPanel.append(towerDetails, upgradeTarget, sell.button);
  ring.append(towerPanel);
  let state = initial;
  let chosen: CellIndex | undefined;
  let managing = false;
  let notice: { cell: CellIndex; until: number } | undefined;
  let cached:
    | {
        cell: CellIndex;
        kind: string;
        state: GameState;
        preview: ReturnType<typeof describePreview>;
      }
    | undefined;

  const close = (): void => {
    const focusInsideRing = ring.contains(document.activeElement);
    chosen = undefined;
    managing = false;
    cached = undefined;
    ring.hidden = true;
    anchor.hidden = true;
    detail.textContent = '';
    if (focusInsideRing) canvas.focus({ preventScroll: true });
  };

  const submit = (kind: string): void => {
    if (chosen === undefined) return;
    actions.placeTower(chosen, kind);
    close();
  };

  const manage = (action: TowerAction): void => {
    if (managing && chosen !== undefined) actions.manageTower(chosen, action);
  };
  upgradeTarget.addEventListener('click', () => manage('upgradeTower'));
  sell.button.addEventListener('click', () => manage('sellTower'));

  const refreshTower = (tower: NonNullable<ReturnType<typeof queryTower>>): void => {
    const name = state.towerDefinitions[tower.kind]?.name ?? tower.kind;
    updateText(
      towerDetails,
      `${name} · 等級 ${tower.level}\n對低地射程 ${tower.range} · 傷害 ${tower.damage}`,
    );
    const price = tower.upgradeCost;
    updateText(upgrade.price, price === null ? '已滿級' : `${price} 金`);
    upgrade.button.classList.toggle('unaffordable', price !== null && price > state.money);
    const refundRule = tower.refundPercent === 100 ? '全額' : `${tower.refundPercent}%`;
    updateText(sell.price, `+${tower.refund}（${refundRule}）`);
    if (price === null && document.activeElement === upgrade.button)
      sell.button.focus({ preventScroll: true });
    upgrade.button.disabled = price === null;
  };

  const choices = Object.entries(initial.towerDefinitions).map(([kind, definition], index) => {
    const shortcut = String(index + 1);
    const button = document.createElement('button');
    button.className = 'build-choice';
    button.type = 'button';
    button.setAttribute('aria-keyshortcuts', shortcut);
    button.setAttribute('aria-describedby', detail.id);
    button.dataset.kind = kind;
    const key = document.createElement('kbd');
    key.textContent = shortcut;
    key.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = definition.name;
    const cost = document.createElement('span');
    cost.className = 'build-cost';
    cost.textContent = `${definition.cost} 金`;
    button.append(key, name, cost);
    button.addEventListener('click', () => submit(kind));
    options.append(button);
    return { kind, button, shortcut };
  });

  const centeredX = (node: HTMLElement, x: number): number => {
    const halfWidth = node.offsetWidth / 2;
    return Math.max(
      EDGE_MARGIN + halfWidth,
      Math.min(x, window.innerWidth - halfWidth - EDGE_MARGIN),
    );
  };

  const positionNear = (
    node: HTMLElement,
    point: ScreenPoint,
    gap: number,
    preferAbove: boolean,
  ): void => {
    const height = node.offsetHeight;
    const above = point.y - height - gap;
    const below = point.y + gap;
    const fitsAbove = above >= EDGE_MARGIN;
    const fitsBelow = below + height + EDGE_MARGIN <= window.innerHeight;
    const y = (preferAbove && fitsAbove) || !fitsBelow ? Math.max(EDGE_MARGIN, above) : below;
    node.style.left = `${centeredX(node, point.x)}px`;
    node.style.top = `${y}px`;
  };

  const positionRing = (cell: CellIndex, bounds: DOMRect) => {
    const point = projectCell(state.level, cell, bounds);
    if (point === undefined) {
      close();
      return;
    }
    anchor.style.left = `${point.x}px`;
    anchor.style.top = `${point.y}px`;
    const height = ring.offsetHeight;
    const gap = managing ? -12 : RING_GAP;
    const x = centeredX(ring, point.x);
    const above = point.y - height + gap;
    const below = point.y - gap;
    const placeBelow = above < EDGE_MARGIN;
    const top = placeBelow ? below : above;
    ring.classList.toggle('below-cell', placeBelow);
    ring.style.left = `${x}px`;
    ring.style.top = `${Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - height - EDGE_MARGIN))}px`;
    return { point, below: placeBelow };
  };

  const showReason = (cell: CellIndex, reason: RejectionReason): void => {
    notice = { cell, until: performance.now() + FEEDBACK_DURATION_MS };
    // Keep the live region in the DOM and touch it only when there is new feedback.
    feedback.textContent = REASONS[reason];
  };

  document.addEventListener('click', (event) => {
    if (event.composedPath().includes(ring)) return;
    if (event.target !== canvas) {
      if (
        managing &&
        event.target instanceof Element &&
        event.target.closest('#game-controls') !== null
      )
        return;
      if (chosen !== undefined) close();
      return;
    }
    if (state.phase === 'victory' || state.phase === 'defeat') return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    const cell = pickCell(
      state.level,
      {
        origin: { x: origin.x, y: origin.y / LAYER_HEIGHT, z: origin.z },
        direction: { x: direction.x, y: direction.y / LAYER_HEIGHT, z: direction.z },
      },
      new Map(state.towers.map((tower) => [tower.cell, towerStructure(tower)])),
    );
    const tower = cell === undefined ? null : queryTower(state, cell);
    if (chosen !== undefined && (tower === null || chosen === cell)) {
      close();
      return;
    }
    if (cell === undefined) return;
    if (tower === null) {
      const first = choices[0];
      if (first === undefined) return;
      const { reason } = previewPlacement(state, cell, first.kind);
      if (reason === 'unbuildableCell' || reason === 'occupiedCell') {
        actions.placeTower(cell, first.kind);
        return;
      }
    }

    chosen = cell;
    managing = tower !== null;
    notice = undefined;
    feedback.textContent = '';
    detail.textContent = '';
    options.hidden = managing;
    towerPanel.hidden = !managing;
    ring.setAttribute('aria-label', managing ? '升級／賣出環' : '建造環');
    if (tower === null) {
      ring.removeAttribute('aria-describedby');
    } else {
      ring.setAttribute('aria-describedby', towerDetails.id);
      refreshTower(tower);
    }
    ring.hidden = false;
    anchor.hidden = false;
    if (positionRing(cell, bounds) !== undefined) ring.focus({ preventScroll: true });
  });

  document.addEventListener('contextmenu', (event) => {
    if (chosen === undefined) return;
    event.preventDefault();
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (chosen === undefined || event.defaultPrevented || event.isComposing || isGameDialogOpen())
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (managing) {
      const key = event.key.toLowerCase();
      if (key !== 'u' && key !== 's') return;
      event.preventDefault();
      manage(key === 'u' ? 'upgradeTower' : 'sellTower');
      return;
    }
    const choice = choices.find(({ shortcut }) => shortcut === event.key);
    if (choice === undefined) return;
    event.preventDefault();
    submit(choice.kind);
  });

  return {
    reset(): void {
      close();
      notice = undefined;
      feedback.textContent = '';
    },
    onEvents(events: readonly GameEvent[]): void {
      for (const event of events) {
        if (event.type === 'rejected') showReason(event.cell, event.reason);
      }
    },
    update(current: GameState) {
      state = current;
      updateText(balance, String(state.money));
      if (chosen !== undefined && (state.phase === 'victory' || state.phase === 'defeat')) close();
      if (chosen === undefined && notice === undefined) return undefined;
      const bounds = canvas.getBoundingClientRect();
      if (notice !== undefined) {
        if (performance.now() >= notice.until) {
          notice = undefined;
          feedback.textContent = '';
        } else {
          const point = projectCell(state.level, notice.cell, bounds);
          feedback.style.visibility = point === undefined ? 'hidden' : '';
          if (point !== undefined) {
            const belowRing =
              managing && notice.cell === chosen && ring.classList.contains('below-cell');
            positionNear(feedback, point, 12, belowRing);
          }
        }
      }
      const cell = chosen;
      if (cell === undefined) return undefined;
      if (managing) {
        const tower = queryTower(state, cell);
        if (tower === null) {
          close();
          return undefined;
        }
        refreshTower(tower);
        if (positionRing(cell, bounds) === undefined) return undefined;
        return { cell, range: tower.range };
      }
      const position = positionRing(cell, bounds);
      if (position === undefined) return undefined;

      for (const { button, kind } of choices) {
        button.classList.toggle('unaffordable', !canAffordTower(state, kind));
      }
      const choice =
        choices.find(({ button }) => button.matches(':hover')) ??
        choices.find(({ button }) => button.matches(':focus-visible'));
      if (choice === undefined) {
        updateText(detail, '');
        return undefined;
      }
      if (
        cached === undefined ||
        cached.cell !== cell ||
        cached.kind !== choice.kind ||
        !samePlacementPreviewInputs(cached.state, state)
      ) {
        cached = {
          cell,
          kind: choice.kind,
          state,
          preview: describePreview(state, cell, choice.kind),
        };
      }
      updateText(detail, cached.preview.text);
      if (cached.preview.text !== '')
        positionNear(detail, position.point, RING_GAP + 8, position.below);
      return cached.preview.render;
    },
  };
}
