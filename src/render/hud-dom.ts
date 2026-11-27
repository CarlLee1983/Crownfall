import { type Camera, Vector3 } from 'three';
import { type CellIndex, cellPoint, groundHeight, type Level } from '../core';
import { LAYER_HEIGHT } from './terrain';

export function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`找不到 #${id}`);
  return node;
}

export function updateText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function cellProjection(camera: Camera) {
  const projected = new Vector3();
  return (level: Level, cell: CellIndex, bounds: DOMRect) => {
    const point = cellPoint(level, cell);
    const height = groundHeight(level, point) * LAYER_HEIGHT;
    projected.set(point.x, height, point.y).project(camera);
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1)
      return undefined;
    return {
      x: bounds.left + ((projected.x + 1) * bounds.width) / 2,
      y: bounds.top + ((1 - projected.y) * bounds.height) / 2,
    };
  };
}
