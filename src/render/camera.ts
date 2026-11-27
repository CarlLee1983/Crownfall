import { PerspectiveCamera } from 'three';
import type { Level } from '../core';

const FOV_DEGREES = 45;
const PITCH = (58 * Math.PI) / 180;
const MARGIN = 1.15;

/** 固定斜俯視相機。 */
export function createCamera(level: Level): {
  camera: PerspectiveCamera;
  resize(aspect: number): void;
} {
  const camera = new PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);
  const centerX = (level.width - 1) / 2;
  const centerZ = (level.height - 1) / 2;
  // 以外接球半徑估距離，旋轉角度不同時地圖都不會被切到。
  const radius = (Math.hypot(level.width, level.height) / 2) * MARGIN;

  const resize = (aspect: number): void => {
    const halfVertical = (FOV_DEGREES * Math.PI) / 360;
    const halfFov = Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * aspect));
    const distance = radius / Math.sin(halfFov);
    camera.aspect = aspect;
    camera.position.set(centerX, distance * Math.sin(PITCH), centerZ + distance * Math.cos(PITCH));
    camera.lookAt(centerX, 0, centerZ);
    camera.updateProjectionMatrix();
  };

  return { camera, resize };
}
