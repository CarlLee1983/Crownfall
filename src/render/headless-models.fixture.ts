import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function headlessModelLoader() {
  const parser = new GLTFLoader();
  // Image decoding needs a browser. Keep the real GLB geometry, materials and animations.
  parser.register(() => ({ name: 'headless-textures', loadTexture: async () => new Texture() }));
  return {
    loadAsync: async (url: string) => {
      const file = new URL(`./models/${basename(url)}`, import.meta.url);
      const bytes = await readFile(file);
      return parser.parseAsync(Uint8Array.from(bytes).buffer, '');
    },
  };
}
