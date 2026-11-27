import { type Camera, Vector3 } from 'three';
import type { EnemyId } from '../core';
import type { createCombatFeedback } from './combat-feedback';
import { element } from './hud-dom';

type CombatFrame = ReturnType<ReturnType<typeof createCombatFeedback>['update']>;

export function createCombatHud(canvas: HTMLCanvasElement, camera: Camera) {
  const lives = element('game-lives');
  const labels = new Map<EnemyId, HTMLSpanElement>();
  const projected = new Vector3();

  function reset(): void {
    for (const label of labels.values()) label.remove();
    labels.clear();
    lives.style.scale = '';
  }

  function update({ bounties, lifePulse }: CombatFrame): void {
    lives.style.scale = lifePulse > 0 ? String(1 + lifePulse) : '';
    const visible = new Set<EnemyId>();
    const bounds = canvas.getBoundingClientRect();
    for (const { id, opacity, position, horizontalOffset, text } of bounties) {
      projected.copy(position).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1)
        continue;
      visible.add(id);
      let label = labels.get(id);
      if (label === undefined) {
        label = document.createElement('span');
        label.className = 'combat-bounty';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = text;
        labels.set(id, label);
        document.body.append(label);
      }
      const x = bounds.left + ((projected.x + 1) * bounds.width) / 2 + horizontalOffset;
      const y = bounds.top + ((1 - projected.y) * bounds.height) / 2;
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      label.style.opacity = String(opacity);
    }
    for (const [id, label] of labels) {
      if (visible.has(id)) continue;
      label.remove();
      labels.delete(id);
    }
  }

  return { reset, update };
}
