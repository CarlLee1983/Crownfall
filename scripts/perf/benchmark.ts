import { WebGLRenderer } from 'three';
import { loadModels } from '../../src/render/models';
import { estimateFrameCost } from '../../src/render/performance-budget';
import { createPixelRenderer } from '../../src/render/pixel-renderer';
import { performanceFrame, RESEARCH_WAVE } from './frame';
import { DPR, HEIGHT, WIDTH } from './viewport';

const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 180;

async function measure() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (canvas === null) throw new Error('找不到量測畫布');
  if (innerWidth !== WIDTH || innerHeight !== HEIGHT || devicePixelRatio !== DPR) {
    throw new Error('量測視窗需為 1920×1080 CSS px，DPR 2');
  }

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x0a0d0a);
  renderer.setPixelRatio(DPR);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.info.autoReset = false;
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu: unknown = extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
  if (typeof gpu !== 'string' || !/Metal.*Apple M4/.test(gpu)) {
    throw new Error(`量測需要 Apple M4 的 ANGLE Metal，瀏覽器回報 ${gpu}`);
  }

  const wave = Number(new URLSearchParams(location.search).get('wave') ?? RESEARCH_WAVE);
  const { scene, camera, state, peakAlive } = performanceFrame(await loadModels(), wave);
  const pixelRenderer = createPixelRenderer(renderer, scene, camera);
  pixelRenderer.resize(WIDTH, HEIGHT);
  const pixel = new Uint8Array(4);
  const syncTimes: number[] = [];
  const drawCalls: number[] = [];
  const triangles: number[] = [];
  for (let frame = 0; frame < WARMUP_FRAMES + MEASURED_FRAMES; frame++) {
    await new Promise<number>(requestAnimationFrame);
    renderer.info.reset();
    pixelRenderer.render();
    const start = performance.now();
    // A readback waits for queued GPU work on ANGLE Metal, where finish() measured zero.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const syncMs = performance.now() - start;
    if (frame < WARMUP_FRAMES) continue;
    syncTimes.push(syncMs);
    drawCalls.push(renderer.info.render.calls);
    triangles.push(renderer.info.render.triangles);
  }

  return {
    gpu,
    viewport: `${WIDTH}×${HEIGHT} @ ${DPR}`,
    framebuffer: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
    wave: state.waveNumber,
    tick: state.tick,
    enemies: state.enemies.length,
    peakAlive,
    towers: state.towers.length,
    warmupFrames: WARMUP_FRAMES,
    measuredFrames: MEASURED_FRAMES,
    gpuSyncP95Ms: percentile(syncTimes, 0.95),
    drawCalls: Math.max(...drawCalls),
    triangles: Math.max(...triangles),
    sceneEstimate: estimateFrameCost(scene),
  };
}

function percentile(samples: number[], percentile: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * percentile) - 1] ?? 0;
}

declare global {
  interface Window {
    benchmarkResult: ReturnType<typeof measure>;
  }
}

window.benchmarkResult = measure();
