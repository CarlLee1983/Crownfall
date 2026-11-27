import { NodeIO } from '@gltf-transform/core';
import manifest from '../docs/art/asset-manifest.json';
import { prepareHexagonModel } from './build-hexagon-model';
import { buildSceneryModels } from './build-scenery-model';
import { buildTowerModels } from './build-tower-models';
import { buildEnemyModels } from './enemy-models';
import { pinnedModelUrl } from './pinned-model';

const io = new NodeIO(fetch).setAllowNetwork(true);
await buildEnemyModels(io);

const archer = manifest.assets.find(({ id }) => id === 'tower-archer');
if (archer === undefined) throw new Error('缺少弓箭塔的來源記錄');
const archerDocument = await io.read(pinnedModelUrl(archer.source));
await prepareHexagonModel(archerDocument);
await io.write(archer.path, archerDocument);
console.log(`${archer.path} (${io.lastWriteBytes} bytes)`);

await buildTowerModels(io);
await buildSceneryModels(io);
