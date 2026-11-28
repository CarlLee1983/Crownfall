import { expect, it } from 'vitest';
import { content } from '../content/content';
import { createGame, parseLevel } from '../core';
import { buildGuideCells } from './build-guide';

it('marks the tier 2 plateau beside a tier 1 route and ignores same-tier terrain', () => {
  const parsed = parseLevel(['s++g', '.##.']);
  const level = {
    ...parsed,
    cells: parsed.cells.map((cell, index) => (index === 6 ? { ...cell, layer: 2 } : cell)),
  };

  const state = createGame(content, level);

  expect(buildGuideCells(state, 'basic').plateau).toBe(6);
});
