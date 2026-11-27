import { type Document, getBounds, Node, type NodeIO, type Scene } from '@gltf-transform/core';
import { copyToDocument, unpartition } from '@gltf-transform/functions';
import { OctahedronGeometry } from 'three';
import manifest from '../docs/art/asset-manifest.json';
import { prepareHexagonModel } from './build-hexagon-model';

interface PinnedModel {
  readonly url_or_tool: string;
  readonly commit: string;
  readonly prompt_or_source_record: string;
}

function sourceUrl(source: PinnedModel): string {
  const repository = new URL(source.url_or_tool).pathname;
  return `https://raw.githubusercontent.com${repository}/${source.commit}/${source.prompt_or_source_record}`;
}

async function mountCrossbow(
  io: NodeIO,
  tower: Document,
  scene: Scene,
  source: PinnedModel,
): Promise<void> {
  const roof = tower
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === 'building_tower_B_top_blue');
  if (roof === undefined) throw new Error('弩砲塔原檔缺少頂蓋');
  // Tower B has an open stone platform below its roof. Use it as the ballista's mount.
  roof.dispose();
  const platformTop = getBounds(scene).max[1];

  const weapon = await io.read(sourceUrl(source));
  const sourceNode = weapon.getRoot().getDefaultScene()?.listChildren()[0];
  if (sourceNode === undefined) throw new Error('弩砲原檔缺少模型');
  const crossbow = copyToDocument(tower, weapon, [sourceNode]).get(sourceNode);
  if (!(crossbow instanceof Node)) throw new Error('無法匯入弩砲模型');
  crossbow.setScale([1.14, 1.1, 1]).setTranslation([0, platformTop + 0.09, -0.43]);
  scene.addChild(crossbow);
  await tower.transform(unpartition());
}

function addCrystal(tower: Document, scene: Scene): void {
  const buffer = tower.getRoot().listBuffers()[0];
  if (buffer === undefined) throw new Error('法師塔原檔缺少頂點資料');
  const geometry = new OctahedronGeometry(0.22).scale(0.82, 1.5, 0.82);
  const material = tower
    .createMaterial('Amethyst')
    .setBaseColorFactor([0.26, 0.1, 0.48, 1])
    .setEmissiveFactor([0.34, 0.12, 0.64])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.8);
  const primitive = tower.createPrimitive().setMaterial(material);
  for (const [semantic, attribute] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
  ] as const) {
    primitive.setAttribute(
      semantic,
      tower
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(geometry.getAttribute(attribute).array))
        .setBuffer(buffer),
    );
  }
  const mesh = tower.createMesh('Amethyst').addPrimitive(primitive);
  const roofHeight = getBounds(scene).max[1];
  // The original spire sits on the +Z side of the church.
  const crystal = tower
    .createNode('Crystal')
    .setMesh(mesh)
    .setTranslation([0, roofHeight + 0.3, 0.315]);
  scene.addChild(crystal);
}

export async function buildTowerModels(io: NodeIO): Promise<void> {
  for (const id of ['tower-ballista', 'tower-mage']) {
    const asset = manifest.assets.find((candidate) => candidate.id === id);
    if (asset?.source.commit === undefined) throw new Error(`${id} 缺少來源版本`);
    const tower = await io.read(sourceUrl({ ...asset.source, commit: asset.source.commit }));
    const scene = tower.getRoot().getDefaultScene();
    if (scene === null) throw new Error(`${id} 缺少預設場景`);
    if (id === 'tower-ballista') {
      if (asset.accessory === undefined) throw new Error('弩砲塔缺少弩砲來源');
      await mountCrossbow(io, tower, scene, asset.accessory);
    } else {
      addCrystal(tower, scene);
    }
    await prepareHexagonModel(tower);
    await io.write(asset.path, tower);
    console.log(`${asset.path} (${io.lastWriteBytes} bytes)`);
  }
}
