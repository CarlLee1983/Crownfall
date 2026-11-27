import { NodeIO } from '@gltf-transform/core';
import { buildEnemyModels } from './enemy-models';

const io = new NodeIO(fetch).setAllowNetwork(true);
await buildEnemyModels(io);
