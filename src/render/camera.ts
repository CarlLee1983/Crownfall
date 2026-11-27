import { MathUtils, PerspectiveCamera } from 'three';
import type { Level } from '../core';
import { LAYER_HEIGHT } from './terrain';

const FOV_DEGREES = 45;
const PITCH = (58 * Math.PI) / 180;
const MARGIN = 1.15;
const CLOSEST_DISTANCE_RATIO = 0.5;

/** 固定斜俯視相機。 */
export function createCamera(level: Level) {
  const camera = new PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);
  const centerX = (level.width - 1) / 2;
  const centerZ = (level.height - 1) / 2;
  const topLayer = level.cells.reduce((highest, { layer }) => Math.max(highest, layer), 1);
  // 以較窄的視角容納整張地圖，包含高台與地形厚度。
  const radius = Math.hypot(level.width / 2, level.height / 2, topLayer * LAYER_HEIGHT) * MARGIN;
  let targetX = centerX;
  let targetZ = centerZ;
  let overviewDistance = 0;
  let distance = 0;
  camera.rotation.x = -PITCH;

  const updatePosition = (): void => {
    camera.position.set(targetX, distance * Math.sin(PITCH), targetZ + distance * Math.cos(PITCH));
    // HUD 投影與點選會在 renderer.render() 之前讀取矩陣。
    camera.updateMatrixWorld();
  };

  const resize = (aspect: number): void => {
    const halfVertical = (FOV_DEGREES * Math.PI) / 360;
    const halfFov = Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * aspect));
    overviewDistance = radius / Math.sin(halfFov);
    distance = overviewDistance;
    targetX = centerX;
    targetZ = centerZ;
    camera.aspect = aspect;
    camera.far = overviewDistance + radius * 2;
    camera.updateProjectionMatrix();
    updatePosition();
  };

  const pan = (deltaX: number, deltaZ: number): void => {
    targetX = MathUtils.clamp(targetX + deltaX, 0, level.width - 1);
    targetZ = MathUtils.clamp(targetZ + deltaZ, 0, level.height - 1);
    updatePosition();
  };

  const zoom = (factor: number): void => {
    distance = MathUtils.clamp(
      distance * factor,
      overviewDistance * CLOSEST_DISTANCE_RATIO,
      overviewDistance,
    );
    updatePosition();
  };

  resize(1);
  return { camera, resize, pan, zoom };
}
