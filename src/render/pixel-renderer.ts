import {
  type Camera,
  Matrix4,
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
import { READ } from './read';

// PROTOTYPE #103: ?px=3|2|1 switches pixel size.
const PIXEL_SIZE = Number(new URLSearchParams(location.search).get('px') ?? 3);

export function createPixelRenderer(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const world = new WebGLRenderTarget(1, 1, {
    magFilter: NearestFilter,
    minFilter: NearestFilter,
    colorSpace: SRGBColorSpace,
  });
  const worldSize = new Vector2(1, 1);
  const cssSize = new Vector2(1, 1);
  const worldFrame = new Matrix4();
  const projection = new Matrix4();
  const inverseProjection = new Matrix4();
  const screen = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: {
        world: { value: world.texture },
        worldSize: { value: worldSize },
        cssSize: { value: cssSize },
        pixelSize: { value: PIXEL_SIZE },
        outline: { value: READ === 'outline' ? 1 : 0 },
      },
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
        uniform vec2 cssSize;
        uniform float pixelSize;
        uniform float outline;
        varying vec2 screenUv;
        void main() {
          // Evaluate the vignette at the world texel center so it shares the pixel grid.
          vec2 cssPosition = vec2(screenUv.x, 1.0 - screenUv.y) * cssSize;
          vec2 pixelUv = (floor(cssPosition / pixelSize) + 0.5) / worldSize;
          pixelUv.y = 1.0 - pixelUv.y;
          vec4 color = texture2D(world, pixelUv);
          if (outline > 0.5) {
            // PROTOTYPE #107: enemy pixels carry an id in alpha (< 1); the world is 1.0.
            // Darken a pixel when a 4-neighbour has a lower alpha, i.e. outline the enemy
            // silhouette from outside and separate overlapping enemies.
            vec2 texel = 1.0 / worldSize;
            float a = color.a;
            float m = min(min(texture2D(world, pixelUv + vec2(texel.x, 0.0)).a,
                              texture2D(world, pixelUv - vec2(texel.x, 0.0)).a),
                          min(texture2D(world, pixelUv + vec2(0.0, texel.y)).a,
                              texture2D(world, pixelUv - vec2(0.0, texel.y)).a));
            if (m < a - 0.03) color.rgb = vec3(0.01, 0.012, 0.02);
          }
          float edge = smoothstep(0.35, 0.85, distance(pixelUv, vec2(0.5)));
          // Variant D uses linear world values as display values for its dark grade.
          gl_FragColor = vec4(color.rgb * (1.0 - edge * 0.55), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    }),
  );
  screen.frustumCulled = false;
  const screenCamera = new OrthographicCamera();

  function resize(cssWidth: number, cssHeight: number): void {
    cssSize.set(Math.max(1, cssWidth), Math.max(1, cssHeight));
    const width = Math.ceil(cssSize.x / PIXEL_SIZE);
    const height = Math.ceil(cssSize.y / PIXEL_SIZE);
    worldSize.set(width, height);
    world.setSize(width, height);

    // Pad the right and bottom to whole texels. Keep the visible projection aligned
    // with the overlay camera when the blit crops those partial blocks.
    const scaleX = cssSize.x / (width * PIXEL_SIZE);
    const scaleY = cssSize.y / (height * PIXEL_SIZE);
    worldFrame.makeScale(scaleX, scaleY, 1).setPosition(scaleX - 1, 1 - scaleY, 0);
  }

  function render(): void {
    const { mask } = camera.layers;
    const { fog } = scene;
    const { autoClear } = renderer;

    try {
      camera.layers.set(WORLD_LAYER);
      renderer.setRenderTarget(world);
      projection.copy(camera.projectionMatrix);
      inverseProjection.copy(camera.projectionMatrixInverse);
      camera.projectionMatrix.premultiply(worldFrame);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      try {
        renderer.render(scene, camera);
      } finally {
        camera.projectionMatrix.copy(projection);
        camera.projectionMatrixInverse.copy(inverseProjection);
      }

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
