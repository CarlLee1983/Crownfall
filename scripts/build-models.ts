import { NodeIO } from '@gltf-transform/core';
import manifest from '../docs/art/asset-manifest.json';
import { prepareHexagonModel } from './build-hexagon-model';
import { buildTowerModels } from './build-tower-models';
import { buildEnemyModels } from './enemy-models';

const io = new NodeIO(fetch).setAllowNetwork(true);
await buildEnemyModels(io);

const archer = manifest.assets.find(({ id }) => id === 'tower-archer');
if (archer?.source.commit === undefined) throw new Error('缺少弓箭塔的來源版本');
const archerUpstream = new URL(archer.source.url_or_tool);
const archerInput = `https://raw.githubusercontent.com${archerUpstream.pathname}/${archer.source.commit}/${archer.source.prompt_or_source_record}`;
const archerDocument = await io.read(archerInput);
await prepareHexagonModel(archerDocument);
await io.write(archer.path, archerDocument);
console.log(`${archer.path} (${io.lastWriteBytes} bytes)`);

await buildTowerModels(io);
