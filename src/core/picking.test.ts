import { expect, it } from 'vitest';
import { type CellIndex, parseLevel, pickCell } from './index';

it('picks raised ground before the ray reaches the lower layer', () => {
  const level = parseLevel(['S#.G']);

  expect(
    pickCell(level, {
      origin: { x: 3, y: 3, z: 0 },
      direction: { x: -1, y: -1, z: 0 },
    }),
  ).toBe(1);
});

it('picks the exposed cliff edge in front of a lower cell', () => {
  const level = parseLevel(['S.#G']);

  expect(
    pickCell(level, {
      origin: { x: 0, y: 1.5, z: 0 },
      direction: { x: 1, y: -0.5, z: 0 },
    }),
  ).toBe(2);
});

it('picks the sloped ramp before the ray enters the cell uphill', () => {
  const level = parseLevel(['S^+g']);

  expect(
    pickCell(level, {
      origin: { x: 0, y: 1, z: 0 },
      direction: { x: 1, y: -0.5, z: 0 },
    }),
  ).toBe(1);
});

it('picks the starting cell when the ray lies on flat ground', () => {
  const level = parseLevel(['S#.G']);

  expect(
    pickCell(level, {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    }),
  ).toBe(0);
});

it('picks the starting ramp when the ray follows its slope uphill', () => {
  const level = parseLevel(['S^+g']);

  expect(
    pickCell(level, {
      origin: { x: 1, y: 0.5, z: 0 },
      direction: { x: 1, y: 1, z: 0 },
    }),
  ).toBe(1);
});

it('picks the first cell when a ray from outside enters along the top surface', () => {
  const level = parseLevel(['S#.G']);

  expect(
    pickCell(level, {
      origin: { x: 1, y: 1, z: -1 },
      direction: { x: 0, y: 0, z: 1 },
    }),
  ).toBe(1);
});

it.each([
  { dx: 1, expected: 1 },
  { dx: -1, expected: 0 },
])('picks the coplanar cell entered from a shared edge (dx=$dx)', ({ dx, expected }) => {
  const level = parseLevel(['S.G']);

  expect(
    pickCell(level, {
      origin: { x: 0.5, y: 0, z: 0 },
      direction: { x: dx, y: 0, z: 0 },
    }),
  ).toBe(expected);
});

it('picks the coplanar cell entered diagonally from a shared corner', () => {
  const level = parseLevel(['S.', '.G']);

  expect(
    pickCell(level, {
      origin: { x: 0.5, y: 0, z: 0.5 },
      direction: { x: 1, y: 0, z: 1 },
    }),
  ).toBe(3);
});

it('returns no cell when the ray passes above the map and lands outside it', () => {
  const level = parseLevel(['S#.G']);

  expect(
    pickCell(level, {
      origin: { x: 1, y: 2, z: 0 },
      direction: { x: 0, y: -1, z: 1 },
    }),
  ).toBeUndefined();
});

it('picks the top of a tower standing in front of lower ground', () => {
  const level = parseLevel(['S..G']);
  const ray = { origin: { x: 3, y: 2, z: 0 }, direction: { x: -1, y: -1, z: 0 } };

  expect(pickCell(level, ray)).toBe(1);
  expect(pickCell(level, ray, new Map([[2 as CellIndex, { height: 1, halfWidth: 0.5 }]]))).toBe(2);
});

it('picks the side of a tower that blocks a ray headed off the map', () => {
  const level = parseLevel(['S..G']);
  const ray = { origin: { x: 0, y: 0.5, z: 0 }, direction: { x: 1, y: -0.1, z: 0 } };

  expect(pickCell(level, ray)).toBeUndefined();
  expect(pickCell(level, ray, new Map([[2 as CellIndex, { height: 1, halfWidth: 0.5 }]]))).toBe(2);
});

it('picks the cell behind a narrow tower when the ray passes over its top', () => {
  const level = parseLevel(['S', '.', 'G']);
  const ray = { origin: { x: 0, y: 4, z: 3 }, direction: { x: 0, y: -2, z: -1 } };

  expect(pickCell(level, ray, new Map([[2 as CellIndex, { height: 1.2, halfWidth: 0.5 }]]))).toBe(
    2,
  );
  expect(pickCell(level, ray, new Map([[2 as CellIndex, { height: 1.2, halfWidth: 0.32 }]]))).toBe(
    1,
  );
});

it('stacks a tower on a raised cell above that cell layer', () => {
  const level = parseLevel(['S', '#', 'G']);
  const ray = { origin: { x: 0, y: 1.5, z: 3 }, direction: { x: 0, y: 0, z: -1 } };

  expect(pickCell(level, ray)).toBeUndefined();
  expect(pickCell(level, ray, new Map([[1 as CellIndex, { height: 1, halfWidth: 0.3 }]]))).toBe(1);
});
