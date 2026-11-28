import { content } from '../../src/content/content';
import { level } from '../../src/content/level';
import { applyCommands, type Command, createGame, step, TICKS_PER_SECOND } from '../../src/core';
import { cellIndex } from '../../src/core/level';
import { createBattlefield } from '../../src/render/battlefield';
import type { LoadedModels } from '../../src/render/models';

import { HEIGHT, WIDTH } from './viewport';

export const RESEARCH_WAVE = 9;
const PEAK_TICK = 439;
const placements = {
  basic: [
    [25, 7],
    [19, 9],
    [16, 12],
    [10, 7],
  ],
  sniper: [
    [4, 12],
    [11, 18],
    [26, 1],
    [17, 1],
  ],
  splash: [
    [12, 1],
    [3, 6],
    [20, 18],
    [3, 21],
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
      tick: PEAK_TICK,
      cell: cellIndex(level.width, x, y),
      kind,
    })),
  );
  let peakAlive = 0;
  for (let tick = 0; tick < PEAK_TICK; tick++) {
    const commands = tick === 0 ? [{ type: 'startWave', tick } as const] : [];
    const previous = state;
    const result = step(previous, commands);
    state = result.state;
    const gameMs = (state.tick * 1000) / TICKS_PER_SECOND;
    battlefield.onEvents(result.events, previous, state, gameMs);
    // Advance combat presentation to the same point for the headless and browser runs.
    battlefield.draw(previous, state, 1, gameMs);
    peakAlive = Math.max(peakAlive, state.enemies.length);
  }

  // Place towers in the peak snapshot before advancing combat so the full wave stays visible.
  const previous = state;
  const result = applyCommands(state, build);
  state = result.state;
  const gameMs = (state.tick * 1000) / TICKS_PER_SECOND;
  battlefield.onEvents(result.events, previous, state, gameMs);
  battlefield.draw(previous, state, 1, gameMs);

  return { scene: battlefield.scene, camera: battlefield.cameraView.camera, state, peakAlive };
}
