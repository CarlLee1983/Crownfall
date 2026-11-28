import {
  type BufferGeometry,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  PointLight,
  type Scene,
} from 'three';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';

export function estimateFrameCost(scene: Scene) {
  // The pixel renderer blits its world target with a fullscreen plane (one draw, two triangles).
  let drawCalls = 1;
  let triangles = 2;
  let pointLights = 0;
  scene.traverseVisible((object) => {
    if (object instanceof PointLight) pointLights++;
    if (!(object instanceof Mesh)) return;
    const passes =
      Number(object.layers.isEnabled(WORLD_LAYER)) + Number(object.layers.isEnabled(OVERLAY_LAYER));
    if (passes === 0) return;
    const geometry: BufferGeometry = object.geometry;
    const { material } = object;
    const available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    const { start, count } = geometry.drawRange;
    const end = Math.min(start + count, available);
    const instances =
      object instanceof InstancedMesh
        ? object.count
        : geometry instanceof InstancedBufferGeometry
          ? geometry.instanceCount
          : 1;
    const materialCount = Array.isArray(material) ? material.length : 1;
    drawCalls += passes * (object instanceof InstancedMesh ? 1 : materialCount);
    const drawn = Array.isArray(material)
      ? geometry.groups.reduce(
          (total, group) =>
            total +
            Math.max(0, Math.min(end, group.start + group.count) - Math.max(start, group.start)),
          0,
        )
      : Math.max(0, end - start);
    triangles += passes * Math.floor(drawn / 3) * instances;
  });
  return { drawCalls, triangles, pointLights };
}
