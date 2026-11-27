import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Level } from '../core';
import { LAYER_HEIGHT } from './terrain';

const FOV_DEGREES = 45;
const YAW = Math.PI / 4;
const PITCH = (58 * Math.PI) / 180;
const OVERVIEW_FILL = 0.85;
const CLOSEST_DISTANCE_RATIO = 0.5;

function panFraction(position: number, delta: number, limit: number): number {
  if (delta > 0) return (limit - position) / delta;
  if (delta < 0) return -position / delta;
  return 1;
}

/** 固定斜俯視相機。 */
export function createCamera(level: Level) {
  const camera = new PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);
  const centerX = (level.width - 1) / 2;
  const centerZ = (level.height - 1) / 2;
  const topLayer = level.cells.reduce((highest, { layer }) => Math.max(highest, layer), 1);
  const halfWidth = level.width / 2;
  const halfLength = level.height / 2;
  const top = topLayer * LAYER_HEIGHT;
  const radius = Math.hypot(halfWidth, halfLength, top);
  camera.rotation.set(-PITCH, YAW, 0, 'YXZ');
  const backward = new Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  const inverseRotation = camera.quaternion.clone().invert();
  const corners: Vector3[] = [];
  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [-LAYER_HEIGHT, top]) {
      for (const z of [-halfLength, halfLength]) {
        corners.push(new Vector3(x, y, z).applyQuaternion(inverseRotation));
      }
    }
  }

  let targetX = centerX;
  let targetZ = centerZ;
  let overviewDistance = 0;
  let distance = 0;

  const updatePosition = (): void => {
    camera.position.set(targetX, 0, targetZ).addScaledVector(backward, distance);
    // HUD 投影與點選會在 renderer.render() 之前讀取矩陣。
    camera.updateMatrixWorld();
  };

  const resize = (aspect: number): void => {
    const verticalSlope = Math.tan((FOV_DEGREES * Math.PI) / 360);
    const horizontalSlope = verticalSlope * aspect;
    const projectedBounds = (distance: number) => {
      let left = Infinity;
      let right = -Infinity;
      let bottom = Infinity;
      let top = -Infinity;
      for (const corner of corners) {
        const depth = distance - corner.z;
        const x = corner.x / (depth * horizontalSlope);
        const y = corner.y / (depth * verticalSlope);
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
      return { left, right, bottom, top };
    };

    // 各角的深度不同，取景距離以透視投影後較滿的軸為準。
    let lowerDistance = Math.max(...corners.map((corner) => corner.z)) + camera.near;
    let upperDistance =
      radius + radius / (Math.min(horizontalSlope, verticalSlope) * OVERVIEW_FILL);
    for (let i = 0; i < 24; i++) {
      const middle = (lowerDistance + upperDistance) / 2;
      const { left, right, bottom, top } = projectedBounds(middle);
      if (Math.max(right - left, top - bottom) <= OVERVIEW_FILL * 2) upperDistance = middle;
      else lowerDistance = middle;
    }
    overviewDistance = upperDistance;
    distance = overviewDistance;
    targetX = centerX;
    targetZ = centerZ;
    camera.far = overviewDistance + radius * 2;
    const bounds = projectedBounds(distance);
    // 在維持視角大小與朝向的前提下，把投影外框移到畫面中央。
    const offsetX = ((bounds.left + bounds.right) * aspect) / 4;
    const offsetY = -(bounds.bottom + bounds.top) / 4;
    camera.setViewOffset(aspect, 1, offsetX, offsetY, aspect, 1);
    updatePosition();
  };

  const pan = (deltaX: number, deltaZ: number): void => {
    const maxX = level.width - 1;
    const maxZ = level.height - 1;
    // 兩軸使用相同的比例，讓平移在碰到邊界時維持原方向。
    const fraction = Math.min(
      1,
      panFraction(targetX, deltaX, maxX),
      panFraction(targetZ, deltaZ, maxZ),
    );
    targetX = MathUtils.clamp(targetX + deltaX * fraction, 0, maxX);
    targetZ = MathUtils.clamp(targetZ + deltaZ * fraction, 0, maxZ);
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
