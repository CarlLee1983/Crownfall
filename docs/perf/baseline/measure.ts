import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
// usage: bun measure.ts <distA> <distB>
const [distA, distB] = process.argv.slice(2);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const probe = String.raw`
window.__samples = [];
(() => {
  const r = window.__renderer, sc = window.__scene, gl = r.getContext();
  r.info.autoReset = false;
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const px = new Uint8Array(4); const t0 = performance.now(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); const fin = performance.now() - t0;
    const enemies = sc.children[4].children.length;
    window.__samples.push({ dt: now - last, calls: r.info.render.calls, tris: r.info.render.triangles, fin, enemies,
      geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs.length });
    r.info.reset(); last = now; requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;
for (const [label, dist, qs] of [['A main', distA, ''], ['B prototype', distB, '?px=2']] as const) {
  const server = Bun.serve({ port: 0, async fetch(req) {
    const p = new URL(req.url).pathname; const f = Bun.file(dist + (p === '/' ? '/index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('nf', { status: 404 });
  }});
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:${server.port}/${qs}`);
    const gpu = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2')!; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
    await page.click('#start-game:not([disabled])', { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.evaluate(probe);
    await page.click('#start-wave');
    const lights = await page.evaluate(() => { const c: Record<string, number> = {}; (window as any).__scene.traverse((o: any) => { if (o.isLight) c[o.type] = (c[o.type] ?? 0) + 1; }); return c; });
    await page.waitForTimeout(15000);
    const s: any[] = await page.evaluate(() => (window as any).__samples);
    const body = s.slice(5);
    const col = (k: string) => body.map((x) => x[k]);
    const alive = await page.evaluate(() => { let n = 0; (window as any).__scene.traverse((o: any) => { if (o.userData?.enemy || o.name?.startsWith?.('enemy')) n++; }); return n; });
    const peak = body.reduce((m, x) => (x.calls > m.calls ? x : m), body[0]);
    console.log(JSON.stringify({ label, viewport: `${w}x${h}@2`, gpu, lights, frames: body.length,
      dt: { p50: q(col('dt'), .5), p95: q(col('dt'), .95), max: Math.max(...col('dt')) },
      finishMs: { p50: q(col('fin'), .5), p95: q(col('fin'), .95), max: Math.max(...col('fin')) },
      calls: { p50: q(col('calls'), .5), max: Math.max(...col('calls')) },
      tris: { p50: q(col('tris'), .5), max: Math.max(...col('tris')) },
      peak, peakEnemies: Math.max(...col('enemies')) }));
    await page.close();
  }
  server.stop();
}
await browser.close();
