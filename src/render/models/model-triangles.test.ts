import { Document } from '@gltf-transform/core';
import { expect, it } from 'vitest';
import { countModelTriangles } from './model-triangles';

it('counts indexed and unindexed triangles for each rendered mesh instance', () => {
  const document = new Document();
  const quad = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(12)),
    )
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 1, 3, 2])),
    );
  const triangle = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(9)),
    );
  const mesh = document.createMesh().addPrimitive(quad).addPrimitive(triangle);
  const scene = document.createScene();
  document.getRoot().setDefaultScene(scene);
  scene.addChild(document.createNode().setMesh(mesh));
  scene.addChild(document.createNode().setMesh(mesh));

  expect(countModelTriangles(document.getRoot())).toBe(6);
});
