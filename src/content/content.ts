import type { Content } from '../core';

type EnemyKind = 'grunt' | 'runner' | 'tank';

/** 塔、開局金錢和高度優勢取自規格的起始數值表。 */
export const content = {
  towers: {
    basic: { name: '基本塔', cost: 50, range: 2.5, damage: 4, shotsPerSecond: 2 },
    sniper: { name: '狙擊塔', cost: 100, range: 4.5, damage: 20, shotsPerSecond: 0.6 },
    splash: { name: '範圍塔', cost: 80, range: 2, damage: 6, shotsPerSecond: 1, splashRadius: 1.1 },
  },
  startingMoney: 100,
  heightRangeBonus: 1.5,
  // 保留現階段自動出兵用的敵人與波次，敵人數值取自規格的起始數值表。
  enemies: {
    grunt: { speed: 1.6, hp: 22, bounty: 5 },
    runner: { speed: 2.9, hp: 12, bounty: 4 },
    tank: { speed: 0.9, hp: 95, bounty: 15 },
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
