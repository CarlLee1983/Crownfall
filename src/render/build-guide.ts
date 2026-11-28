import type { Camera } from 'three';
import {
  type CellIndex,
  currentRoute,
  type GameState,
  previewPlacement,
  queryPlacementTarget,
  samePlacementPreviewInputs,
  sameRoute,
} from '../core';
import { cellProjection } from './hud-dom';
import './build-guide.css';

const LABEL_GAP = 24;
const VIEWPORT_MARGIN = 8;
const MIN_LABEL_ROOM = 96;

export function buildGuideCells(state: GameState, kind: string) {
  const route = currentRoute(state);
  const lane = route.find((cell) => {
    const preview = previewPlacement(state, cell, kind);
    return preview.reason === undefined && !sameRoute(preview.route, route);
  });
  const plateau = state.level.cells.findIndex(({ lane }, index) => {
    if (lane) return false;
    const cell = index as CellIndex;
    if (previewPlacement(state, cell, kind).reason !== undefined) return false;
    return route.some((target) => {
      const reach = queryPlacementTarget(state, cell, kind, target);
      return reach !== undefined && reach.heightBonus > 0 && reach.inRange;
    });
  });
  return { lane, plateau: plateau < 0 ? undefined : (plateau as CellIndex) };
}

export function createBuildGuide(
  canvas: HTMLCanvasElement,
  ring: HTMLElement,
  camera: Camera,
  kind: string,
  selectCell: (cell: CellIndex) => void,
) {
  const guide = document.createElement('section');
  guide.className = 'build-guide';
  guide.setAttribute('aria-label', '建造引導');
  guide.hidden = true;
  guide.style.setProperty('--label-gap', `${LABEL_GAP}px`);
  const projectCell = cellProjection(camera);
  let stage: 'pending' | 'showing' | 'finished' = 'pending';
  let cached: GameState | undefined;

  const marker = (type: 'lane' | 'plateau', title: string, description: string) => {
    const button = document.createElement('button');
    button.className = `build-guide-marker build-guide-${type}`;
    button.type = 'button';
    button.dataset.boardCell = '';
    button.hidden = true;
    const heading = document.createElement('strong');
    heading.id = `build-guide-${type}-label`;
    heading.textContent = title;
    const detail = document.createElement('span');
    detail.id = `build-guide-${type}-detail`;
    detail.textContent = description;
    button.setAttribute('aria-labelledby', heading.id);
    button.setAttribute('aria-describedby', detail.id);
    const label = document.createElement('span');
    label.className = 'build-guide-marker-label';
    label.append(heading, detail);
    button.append(label);
    guide.append(button);

    let cell: CellIndex | undefined;
    button.addEventListener('click', () => {
      if (cell !== undefined) selectCell(cell);
    });
    return {
      overlaps(rect: DOMRect): boolean {
        if (button.hidden) return false;
        return [button, label].some((node) => {
          const { left, right, top, bottom } = node.getBoundingClientRect();
          return left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top;
        });
      },
      setCell(target: CellIndex | undefined): void {
        cell = target;
      },
      position(state: GameState, bounds: DOMRect): void {
        const point = cell === undefined ? undefined : projectCell(state.level, cell, bounds);
        button.hidden = point === undefined;
        if (point === undefined) return;
        button.style.left = `${point.x}px`;
        button.style.top = `${point.y}px`;
        const leftRoom = point.x - bounds.left - LABEL_GAP - VIEWPORT_MARGIN;
        const rightRoom = bounds.right - point.x - LABEL_GAP - VIEWPORT_MARGIN;
        const preferLeft = type === 'plateau';
        const preferredRoom = preferLeft ? leftRoom : rightRoom;
        const onLeft = preferredRoom >= MIN_LABEL_ROOM ? preferLeft : leftRoom > rightRoom;
        button.classList.toggle('label-left', onLeft);
        button.style.setProperty('--label-room', `${onLeft ? leftRoom : rightRoom}px`);
      },
    };
  };
  const lane = marker('lane', '路障示範格', '在車道上建塔，讓敵人繞路。');
  const plateau = marker('plateau', '高台示範格', '攻擊低處的敵人時，塔的射程更遠。');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'build-guide-skip';
  skip.textContent = '略過';
  guide.append(skip);
  guide.addEventListener('keydown', (event) => {
    // Keep Space's native button activation from also triggering the global pause shortcut.
    if (event.key === ' ') event.stopPropagation();
  });
  ring.after(guide);

  const finish = (): void => {
    stage = 'finished';
    const focusInside = guide.contains(document.activeElement);
    guide.hidden = true;
    if (focusInside) canvas.focus({ preventScroll: true });
  };
  skip.addEventListener('click', finish);

  return {
    includes(event: Event): boolean {
      return event.composedPath().includes(guide);
    },
    overlaps(rect: DOMRect): boolean {
      return !guide.hidden && (lane.overlaps(rect) || plateau.overlaps(rect));
    },
    show(frameOverview: () => void): void {
      if (stage !== 'pending') return;
      stage = 'showing';
      frameOverview();
    },
    reset(): void {
      stage = 'pending';
      cached = undefined;
      guide.hidden = true;
    },
    update(state: GameState): void {
      if (stage !== 'showing') return;
      if (state.towers.length > 0) {
        finish();
        return;
      }
      guide.hidden = state.phase === 'victory' || state.phase === 'defeat';
      if (guide.hidden) return;
      if (cached === undefined || !samePlacementPreviewInputs(cached, state)) {
        const cells = buildGuideCells(state, kind);
        lane.setCell(cells.lane);
        plateau.setCell(cells.plateau);
        cached = state;
      }
      const bounds = canvas.getBoundingClientRect();
      lane.position(state, bounds);
      plateau.position(state, bounds);
    },
  };
}
