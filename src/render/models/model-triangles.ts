import { Primitive, type Root } from '@gltf-transform/core';

export function countModelTriangles(root: Root): number {
  const scene = root.getDefaultScene();
  if (scene === null) throw new Error('Model has no default scene');
  let triangles = 0;
  // Traversing the rendered scene counts every instance of a shared mesh.
  scene.traverse((node) => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
        throw new Error('Triangle budgets require triangle-list primitives');
      }
      const vertices = primitive.getIndices() ?? primitive.getAttribute('POSITION');
      if (vertices === null) throw new Error('Model primitive has no vertices');
      triangles += vertices.getCount() / 3;
    }
  });
  return triangles;
}
