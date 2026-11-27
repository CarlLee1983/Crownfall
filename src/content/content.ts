import type { Content } from '../core';

type EnemyKind = 'grunt' | 'runner' | 'tank' | 'boss';

/** 戰役內容採用規格的起始數值。 */
export const content = {
  towers: {
    basic: { name: '基本塔', cost: 50, range: 2.5, damage: 4, shotsPerSecond: 2 },
    sniper: { name: '狙擊塔', cost: 100, range: 4.5, damage: 20, shotsPerSecond: 0.6 },
    splash: { name: '範圍塔', cost: 80, range: 2, damage: 6, shotsPerSecond: 1, splashRadius: 1.1 },
  },
  startingMoney: 100,
  startingLives: 20,
  waveClearReward: 30,
  heightRangeBonus: 1.5,
  enemies: {
    grunt: { speed: 1.6, hp: 22, bounty: 5, leakDamage: 1 },
    runner: { speed: 2.9, hp: 12, bounty: 4, leakDamage: 1 },
    tank: { speed: 0.9, hp: 95, bounty: 15, leakDamage: 2 },
    boss: { speed: 0.7, hp: 1200, bounty: 0, leakDamage: 'defeat' },
  },
  waves: [
    { groups: [{ enemy: 'grunt', count: 8, interval: 1, delay: 0 }] },
    {
      groups: [
        { enemy: 'grunt', count: 8, interval: 0.9, delay: 0 },
        { enemy: 'runner', count: 6, interval: 0.5, delay: 6 },
      ],
    },
    {
      groups: [
        { enemy: 'grunt', count: 10, interval: 0.8, delay: 0 },
        { enemy: 'tank', count: 1, interval: 1, delay: 8 },
      ],
    },
    {
      groups: [
        { enemy: 'grunt', count: 12, interval: 0.8, delay: 0 },
        { enemy: 'runner', count: 8, interval: 0.5, delay: 3 },
        { enemy: 'tank', count: 2, interval: 2.5, delay: 6 },
      ],
    },
    { groups: [{ enemy: 'grunt', count: 14, interval: 0.8, delay: 0 }] },
    {
      groups: [
        { enemy: 'runner', count: 24, interval: 0.35, delay: 0 },
        { enemy: 'grunt', count: 6, interval: 0.8, delay: 2 },
      ],
    },
    {
      groups: [
        { enemy: 'grunt', count: 12, interval: 0.8, delay: 0 },
        { enemy: 'runner', count: 6, interval: 0.5, delay: 4 },
      ],
    },
    {
      groups: [
        { enemy: 'tank', count: 6, interval: 2.5, delay: 0 },
        { enemy: 'grunt', count: 10, interval: 0.8, delay: 2 },
      ],
    },
    {
      groups: [
        { enemy: 'grunt', count: 18, interval: 0.8, delay: 0 },
        { enemy: 'runner', count: 14, interval: 0.5, delay: 2 },
        { enemy: 'tank', count: 5, interval: 2.5, delay: 4 },
      ],
    },
    {
      groups: [
        { enemy: 'boss', count: 1, interval: 1, delay: 0 },
        { enemy: 'grunt', count: 10, interval: 0.8, delay: 0 },
        { enemy: 'runner', count: 8, interval: 0.5, delay: 3 },
      ],
    },
  ],
} satisfies Content<EnemyKind>;
