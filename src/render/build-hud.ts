import { type Camera, Raycaster, Vector2 } from 'three';
import {
  type CellIndex,
  canAffordTower,
  cellAt,
  currentRoute,
  type GameEvent,
  type GameState,
  type PlacementRejection,
  pickCell,
  previewPlacement,
  samePlacementPreviewInputs,
} from '../core';
import { cellProjection, element, updateText } from './hud-dom';
import { LAYER_HEIGHT } from './terrain';

const REASONS: Record<PlacementRejection, string> = {
  insufficientFunds: '金錢不足',
  disconnectedRoute: '會讓入口到終點斷線',
  trappedEnemy: '會困住場上的敵人',
  enemyOnCell: '敵人正在這格或下一步要走這格',
  unbuildableCell: '入口、終點與坡道不能建塔',
  occupiedCell: '這格已經有塔',
  unknownTower: '找不到這種塔',
  wrongTick: '建造時機已過',
  gameOver: '遊戲已結束',
};
const FEEDBACK_DURATION_MS = 2600;
const EDGE_MARGIN = 8;
const RING_GAP = 24;

type ScreenPoint = { x: number; y: number };

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
  placeTower: (cell: CellIndex, kind: string) => void,
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
  let state = initial;
  let chosen: CellIndex | undefined;
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
    cached = undefined;
    ring.hidden = true;
    anchor.hidden = true;
    detail.textContent = '';
    if (focusInsideRing) canvas.focus({ preventScroll: true });
  };

  const submit = (kind: string): void => {
    if (chosen === undefined) return;
    placeTower(chosen, kind);
    close();
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
    const below = point.y - height + RING_GAP < EDGE_MARGIN;
    const top = below ? point.y - RING_GAP : point.y - height + RING_GAP;
    ring.classList.toggle('below-cell', below);
    ring.style.left = `${centeredX(ring, point.x)}px`;
    ring.style.top = `${Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - height - EDGE_MARGIN))}px`;
    return { point, below };
  };

  const showReason = (cell: CellIndex, reason: PlacementRejection): void => {
    notice = { cell, until: performance.now() + FEEDBACK_DURATION_MS };
    // Keep the live region in the DOM and touch it only when there is new feedback.
    feedback.textContent = REASONS[reason];
  };

  document.addEventListener('click', (event) => {
    if (event.composedPath().includes(ring)) return;
    if (chosen !== undefined) {
      close();
      return;
    }
    if (event.target !== canvas || choices[0] === undefined) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    const cell = pickCell(state.level, {
      origin: { x: origin.x, y: origin.y / LAYER_HEIGHT, z: origin.z },
      direction: { x: direction.x, y: direction.y / LAYER_HEIGHT, z: direction.z },
    });
    if (cell === undefined) return;

    const { reason } = previewPlacement(state, cell, choices[0].kind);
    if (reason === 'unbuildableCell' || reason === 'occupiedCell') {
      showReason(cell, reason);
      return;
    }
    chosen = cell;
    notice = undefined;
    feedback.textContent = '';
    detail.textContent = '';
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
    if (chosen === undefined || event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
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
      if (chosen === undefined && notice === undefined) return undefined;
      const bounds = canvas.getBoundingClientRect();
      if (notice !== undefined) {
        if (performance.now() >= notice.until) {
          notice = undefined;
          feedback.textContent = '';
        } else {
          const point = projectCell(state.level, notice.cell, bounds);
          feedback.style.visibility = point === undefined ? 'hidden' : '';
          if (point !== undefined) positionNear(feedback, point, 12, false);
        }
      }
      const cell = chosen;
      if (cell === undefined) return undefined;
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
