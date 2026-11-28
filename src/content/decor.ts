import type { GridPoint } from '../core';

/** 火把位置使用格座標，可偏移到入口、城堡與高台邊緣。 */
export const torchPositions: readonly GridPoint[] = [
  { x: 27.42, y: 4.8 },
  { x: 2.1, y: 18.82 },
];

/** 雙岸平原的城堡側樹叢與入口彎道石群。 */
export const castleTrees = [
  { x: 3.45, y: 15.25, scale: 1 },
  { x: 4.55, y: 16.15, scale: 1.15 },
  { x: 3.35, y: 16.55, scale: 0.8 },
] as const;

export const entranceRocks = [
  { x: 23.8, y: 10.5, scale: 0.65 },
  { x: 24.8, y: 10.7, scale: 0.42 },
  { x: 24.5, y: 11.6, scale: 0.55 },
] as const;
