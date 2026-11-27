import type { Content } from '../core';

type EnemyKind = 'grunt' | 'runner' | 'tank';

/** 測試用敵人：速度取自規格的起始數值表。 */
export const content = {
  enemies: {
    grunt: { speed: 1.6 },
    runner: { speed: 2.9 },
    tank: { speed: 0.9 },
  },
  waves: [
    {
      groups: [
        { enemy: 'grunt', count: 8, interval: 1, delay: 0 },
        { enemy: 'runner', count: 6, interval: 0.5, delay: 4 },
        { enemy: 'tank', count: 1, interval: 1, delay: 8 },
      ],
    },
  ],
} satisfies Content<EnemyKind>;
