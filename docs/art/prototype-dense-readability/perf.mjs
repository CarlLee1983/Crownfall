import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
const S = '/private/tmp/claude-501/-Users-carl-Dev-Carl-Crownfall/95a8b477-493b-4e52-8eef-f609b30d3062/scratchpad';
const dist = join(S, 'wt107/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
  let p = new URL(req.url).pathname; if (p === '/') p = '/index.html';
  const f = join(dist, decodeURIComponent(p));
  if (!f.startsWith(dist) || !existsSync(f)) return new Response('nf', { status: 404 });
  return new Response(readFileSync(f), { headers: { 'content-type': types[extname(f)] ?? 'application/octet-stream' } });
}});
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows = {};
for (const round of [1, 2]) for (const read of ['none', 'outline', 'rim', 'accent']) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/?px=2&fx=crumble&read=${read}&stress=9&n=0`);
  await page.waitForFunction(() => !document.getElementById('start-game').disabled, null, { timeout: 60000 });
  await page.click('#start-game');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const r = window.renderer; r.info.autoReset = false;
    const gl = r.getContext(); const px = new Uint8Array(4);
    const orig = r.render.bind(r);
    window.__sync = [];
    r.render = (...a) => { orig(...a); if (!r.autoClear) { const t = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__sync.push(performance.now() - t); } };
    window.__dc = []; window.__tri = []; window.__dt = [];
    let last = performance.now();
    const tick = () => { const n = performance.now(); window.__dt.push(n - last); last = n; window.__dc.push(r.info.render.calls); window.__tri.push(r.info.render.triangles); r.info.reset(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.startStress();
  });
  // Sample while the queue is on screen: from 6 s after start to the first leak.
  await page.waitForTimeout(6000);
  await page.evaluate(() => { window.__dc.length = 0; window.__tri.length = 0; window.__sync.length = 0; window.__dt.length = 0; });
  await page.waitForTimeout(12000);
  const d = await page.evaluate(() => ({ dc: window.__dc, tri: window.__tri, sync: window.__sync, dt: window.__dt, live: window.liveEnemies() }));
  // Three renders per frame (world, blit, overlay) are counted in each sample.
  rows[`${round}-${read}`] = { frames: d.dc.length, dcP50: pct(d.dc, .5), dcMax: Math.max(...d.dc), triP50: pct(d.tri, .5), triMax: Math.max(...d.tri), syncP95: pct(d.sync, .95), syncP50: pct(d.sync, .5), frameP50: pct(d.dt, .5), frameP95: pct(d.dt, .95), live: d.live };
  console.log(round, read, JSON.stringify(rows[`${round}-${read}`]));
  await page.close();
}
writeFileSync(`${S}/dense107/perf.json`, JSON.stringify(rows, null, 1));
await browser.close(); server.stop();
