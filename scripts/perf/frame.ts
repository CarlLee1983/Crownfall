import { content } from '../../src/content/content';
import { level } from '../../src/content/level';
import { type Command, createGame, step, TICKS_PER_SECOND } from '../../src/core';
import { cellIndex } from '../../src/core/level';
import { createBattlefield } from '../../src/render/battlefield';
import type { LoadedModels } from '../../src/render/models';

import { HEIGHT, WIDTH } from './viewport';

export const RESEARCH_WAVE = 9;
const BUILD_TICK = 435;
const PEAK_TICK = 439;
const placements = {
  basic: [
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ],
  sniper: [
    [7, 0],
    [8, 0],
    [9, 0],
    [10, 0],
  ],
  splash: [
    [6, 0],
    [0, 0],
    [1, 0],
    [0, 6],
  ],
} as const;

export function performanceFrame(models: LoadedModels, wave = RESEARCH_WAVE) {
  const battlefield = createBattlefield(models);
  battlefield.cameraView.resize(WIDTH / HEIGHT);
  // Construct the preparation state for the chosen wave with money for all 12 towers.
  let state = { ...createGame({ ...content, startingMoney: 920 }, level), waveNumber: wave - 1 };
  const build: Command[] = Object.entries(placements).flatMap(([kind, cells]) =>
    cells.map(([x, y]) => ({
      type: 'placeTower',
      tick: BUILD_TICK,
      cell: cellIndex(level.width, x, y),
      kind,
    })),
  );
  let peakAlive = 0;
  for (let tick = 0; tick < PEAK_TICK; tick++) {
    const commands =
      tick === 0 ? [{ type: 'startWave', tick } as const] : tick === BUILD_TICK ? build : [];
    const previous = state;
    const result = step(previous, commands);
    state = result.state;
    const gameMs = (state.tick * 1000) / TICKS_PER_SECOND;
    battlefield.onEvents(result.events, previous, state, gameMs);
    // Advance combat presentation to the same point for the headless and browser runs.
    battlefield.draw(previous, state, 1, gameMs);
    peakAlive = Math.max(peakAlive, state.enemies.length);
  }

  return { scene: battlefield.scene, camera: battlefield.cameraView.camera, state, peakAlive };
}
