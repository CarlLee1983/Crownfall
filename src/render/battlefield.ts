import { DirectionalLight, FogExp2, HemisphereLight, Scene, Vector3 } from 'three';
import { torchPositions } from '../content/decor';
import { level } from '../content/level';
import type { GameEvent, GameState } from '../core';
import { type BuildPreview, createBuildLayer } from './build-layer';
import { createCamera } from './camera';
import { createCombatFeedback } from './combat-feedback';
import { createEnemyLayer } from './enemies';
import type { LoadedModels } from './models';
import { createOutskirts } from './outskirts';
import { createPlainsScenery } from './plains-scenery';
import { createShotLayer, type PresentedImpact } from './shots';
import { createTerrain } from './terrain';
import { createTorches } from './torches';

interface DrawOptions {
  readonly allowShake?: boolean;
  readonly preview?: () => BuildPreview | undefined;
  readonly present?: (
    feedback: ReturnType<ReturnType<typeof createCombatFeedback>['update']>,
    resultReady: boolean,
  ) => void;
}

export function createBattlefield(
  models: LoadedModels,
  onImpact?: (impact: PresentedImpact) => void,
) {
  const terrain = createTerrain(level, models.scenery);
  const torches = createTorches(level, torchPositions, models.scenery.torch);
  const cameraView = createCamera(level, terrain.landmarks);
  const { camera } = cameraView;
  const enemies = createEnemyLayer(camera, models.enemies);
  const builds = createBuildLayer(models.towers);
  const combat = createCombatFeedback(enemies);
  const shots = createShotLayer(enemies, builds.towerHeight, combat, onImpact ? { onImpact } : {});
  const cameraPosition = new Vector3();

  const scene = new Scene();
  scene.fog = new FogExp2(0x10180f, 0.012);
  scene.background = scene.fog.color;
  const sun = new DirectionalLight(0xb4c4ff, 3.0);
  sun.position.set(-6, 14, 4);
  scene.add(
    new HemisphereLight(0xcfe3ff, 0x2e2a22, 0.9),
    sun,
    terrain.group,
    createPlainsScenery(level),
    createOutskirts(level, models.outskirts, scene.background),
    torches.group,
    enemies.group,
    builds.group,
    shots.group,
  );

  function onEvents(
    events: readonly GameEvent[],
    previous: GameState,
    current: GameState,
    gameMs: number,
  ): void {
    const immediate = shots.onEvents(events, current, previous, gameMs);
    combat.onEvents(immediate, previous, gameMs);
    enemies.observe(current);
  }

  function draw(
    previous: GameState,
    current: GameState,
    alpha: number,
    gameMs: number,
    { allowShake = true, preview, present }: DrawOptions = {},
  ): void {
    shots.advanceFlights(gameMs, previous === current ? 1 : alpha);
    const feedback = combat.update(gameMs, !allowShake);
    terrain.setCastleFlash(feedback.castleFlash);
    const shaking = feedback.shake.lengthSq() > 0;
    if (shaking) {
      cameraPosition.copy(camera.position);
      camera.translateX(feedback.shake.x);
      camera.translateY(feedback.shake.y);
      camera.updateMatrixWorld();
    }

    try {
      enemies.update(previous, current, alpha, feedback.hitFlash, gameMs, {
        hp: shots.displayHp,
        reaction: feedback.reaction,
      });
      builds.update(previous, current, alpha, preview?.(), enemies.routeMotions());
      // A loss is caused by a leak, so only the castle pulse gates its dialog.
      const resultReady =
        current.phase === 'defeat'
          ? feedback.castleFlash === 0
          : !shots.hasFlights() && !feedback.settling;
      shots.update(gameMs);
      torches.update(gameMs / 1000);
      present?.(feedback, resultReady);
    } finally {
      if (shaking) {
        camera.position.copy(cameraPosition);
        camera.updateMatrixWorld();
      }
    }
  }

  function reset(): void {
    shots.reset();
    enemies.reset();
    combat.reset();
  }

  return { scene, cameraView, towerStructure: builds.towerStructure, onEvents, draw, reset };
}
