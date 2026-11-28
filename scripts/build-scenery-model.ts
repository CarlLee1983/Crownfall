import type { Document, NodeIO } from '@gltf-transform/core';
import { simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import manifest from '../docs/art/asset-manifest.json';
import { prepareHexagonModel } from './build-hexagon-model';
import { pinnedModelUrl } from './pinned-model';

// Castle masonry has split vertices at UV seams. Permit collapses across those seams
// to keep the towers and outer silhouette within the 1,500-triangle budget.
const castleSimplifier = {
  simplify(
    indices: Uint32Array,
    positions: Float32Array,
    stride: number,
    target: number,
    error: number,
  ) {
    return MeshoptSimplifier.simplify(indices, positions, stride, target, error, ['Permissive']);
  },
};

async function prepareSceneryModel(document: Document, id: string): Promise<void> {
  if (id === 'prop-entrance') {
    const nodes = document.getRoot().listNodes();
    const left = nodes.find((node) => node.getName() === 'wall_straight_gate_door_left');
    const right = nodes.find((node) => node.getName() === 'wall_straight_gate_door_right');
    if (left === undefined || right === undefined) throw new Error('入口模型缺少門扇');
    // Rotate the doors around their hinges to leave the entrance passage open.
    left.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    right.setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  } else if (id === 'prop-castle') {
    await MeshoptSimplifier.ready;
    await document.transform(simplify({ simplifier: castleSimplifier, ratio: 0.26, error: 0.12 }));
  }
  await prepareHexagonModel(document);
  if (id === 'decor-rubble') {
    // The rubble is instanced around the outskirts and along cliff feet.
    await MeshoptSimplifier.ready;
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.66, error: 0.03 }));
  }
}

export async function buildSceneryModels(io: NodeIO): Promise<void> {
  for (const asset of manifest.assets.filter(
    ({ id }) => id.startsWith('prop-') || id.startsWith('decor-'),
  )) {
    const { id, source, path } = asset;
    const document = await io.read(pinnedModelUrl(source));
    await prepareSceneryModel(document, id);
    await io.write(path, document);
    console.log(`${path} (${io.lastWriteBytes} bytes)`);
  }
}
