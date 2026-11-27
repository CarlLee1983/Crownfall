import {
  type Camera,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OVERLAY_LAYER, WORLD_LAYER } from './layers';

const PIXEL_SIZE = 3;

export function createPixelRenderer(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const world = new WebGLRenderTarget(1, 1, {
    magFilter: NearestFilter,
    minFilter: NearestFilter,
    colorSpace: SRGBColorSpace,
  });
  const worldSize = new Vector2(1, 1);
  const screen = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: { world: { value: world.texture }, worldSize: { value: worldSize } },
      vertexShader: `
        varying vec2 screenUv;
        void main() {
          screenUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D world;
        uniform vec2 worldSize;
        varying vec2 screenUv;
        void main() {
          // Evaluate the vignette at the world texel center so it shares the pixel grid.
          vec2 pixelUv = (floor(screenUv * worldSize) + 0.5) / worldSize;
          vec4 color = texture2D(world, pixelUv);
          float edge = smoothstep(0.35, 0.85, distance(pixelUv, vec2(0.5)));
          gl_FragColor = vec4(color.rgb * (1.0 - edge * 0.55), color.a);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    }),
  );
  screen.frustumCulled = false;
  const screenCamera = new OrthographicCamera();

  function resize(cssWidth: number, cssHeight: number): void {
    const width = Math.max(1, Math.floor(cssWidth / PIXEL_SIZE));
    const height = Math.max(1, Math.floor(cssHeight / PIXEL_SIZE));
    worldSize.set(width, height);
    world.setSize(width, height);
  }

  function render(): void {
    const { mask } = camera.layers;
    const { fog } = scene;
    const { autoClear } = renderer;

    try {
      camera.layers.set(WORLD_LAYER);
      renderer.setRenderTarget(world);
      renderer.render(scene, camera);

      renderer.setRenderTarget(null);
      renderer.render(screen, screenCamera);

      renderer.autoClear = false;
      renderer.clearDepth();
      scene.fog = null;
      camera.layers.set(OVERLAY_LAYER);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(null);
      renderer.autoClear = autoClear;
      scene.fog = fog;
      camera.layers.mask = mask;
    }
  }

  return { resize, render };
}
