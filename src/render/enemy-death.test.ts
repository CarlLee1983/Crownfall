import { readFile } from 'node:fs/promises';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { content } from '../content/content';
import { level } from '../content/level';
import { createGame, groundHeight } from '../core';
import { cellIndex } from '../core/level';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';
import { LAYER_HEIGHT } from './terrain';

it('keeps the lich and its equipment on the ramp until the final pose starts sinking', async () => {
  const binary = await readFile(new URL('./models/enemy-lich.glb', import.meta.url));
  const loader = new GLTFLoader().register(() => ({
    name: 'Test texture decoder',
    loadTexture: async () => new Texture(),
  }));
  const { scene, animations } = await loader.parseAsync(new Uint8Array(binary).buffer, '');
  const walk = animations.find(({ name }) => name === 'Walking_A');
  const death = animations.find(({ name }) => name === 'Death_C_Skeletons');
  if (walk === undefined || death === undefined) throw new Error('Missing lich animation');

  const initial = createGame(content, level);
  const enemy = {
    id: initial.nextEnemyId,
    kind: 'boss',
    hp: 1,
    maxHp: 1,
    from: cellIndex(level.width, 2, 1),
    to: cellIndex(level.width, 1, 1),
    progress: 0,
  };
  const previous = { ...initial, enemies: [enemy] };
  const current = { ...initial, tick: previous.tick + 1 };
  const layer = createEnemyLayer(new PerspectiveCamera(), { boss: { scene, walk, death } });
  function defeatEnemy() {
    layer.reset();
    layer.hold(enemy, previous);
    const feedback = createCombatFeedback(layer);
    feedback.onImpact(
      { target: enemy, hp: 0, bounty: 1 },
      'basic',
      new Vector3(),
      new Vector3(),
      0,
      false,
    );
    return feedback;
  }

  const vertex = new Vector3();
  function sample(feedback: ReturnType<typeof defeatEnemy>, gameMs: number) {
    const frame = feedback.update(gameMs, false);
    layer.update(previous, current, 1, frame.hitFlash, gameMs, {
      hp: () => undefined,
      reaction: frame.reaction,
    });
    layer.group.updateMatrixWorld(true);
    let clearance = Infinity;
    const positions: number[] = [];
    layer.group.traverseVisible((mesh) => {
      if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) return;
      for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
        mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
        positions.push(...vertex.toArray());
        const floor = groundHeight(level, { x: vertex.x, y: vertex.z }) * LAYER_HEIGHT;
        clearance = Math.min(clearance, vertex.y - floor);
      }
    });
    expect(clearance, `death pose at ${gameMs} ms`).toBeGreaterThanOrEqual(-0.005);
    expect(clearance, `death pose at ${gameMs} ms`).toBeLessThan(0.025);
    return positions;
  }
  const stepped = defeatEnemy();
  for (const gameMs of [0, 100, 350, 700, 1000]) sample(stepped, gameMs);
  const steppedPositions = sample(stepped, 1000);
  const directPositions = sample(defeatEnemy(), 1000);
  expect(directPositions).toHaveLength(steppedPositions.length);
  const differences = directPositions.map((value, index) =>
    Math.abs(value - (steppedPositions[index] ?? 0)),
  );
  expect(Math.max(...differences)).toBeLessThan(0.000_01);
});
