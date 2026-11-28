import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const S = '/private/tmp/claude-501/-Users-carl-Dev-Carl-Crownfall/95a8b477-493b-4e52-8eef-f609b30d3062/scratchpad';
const dist = join(S, 'wt107/dist');
const out = join(S, 'dense107');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json' };
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === '/') p = '/index.html';
    const f = join(dist, decodeURIComponent(p));
    if (!f.startsWith(dist) || !existsSync(f)) return new Response('nf', { status: 404 });
    return new Response(readFileSync(f), { headers: { 'content-type': types[extname(f)] ?? 'application/octet-stream' } });
  },
});
const base = `http://127.0.0.1:${server.port}`;
const reads = ['none', 'outline', 'rim', 'accent'];
const configs = [
  { name: '1280', w: 1280, h: 800, dpr: 1 },
  { name: '1920', w: 1920, h: 1080, dpr: 2 },
];
const waves = (process.env.WAVES ?? '8,9').split(',').map(Number);
const only = process.env.READS?.split(',') ?? reads;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const meta = {};
for (const wave of waves) for (const cfg of configs) for (const read of only) {
  const page = await browser.newPage({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}/?px=2&fx=crumble&read=${read}&stress=${wave}&n=0`);
  await page.waitForFunction(() => document.getElementById('start-game') && !document.getElementById('start-game').disabled, null, { timeout: 60000 });
  await page.click('#start-game');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.startStress());
  // Pause at the first leak (live count drops below its peak) = longest queue.
  const t0 = Date.now();
  let peak = 0;
  for (;;) {
    const n = await page.evaluate(() => window.liveEnemies());
    if (n > peak) peak = n;
    if ((peak > 3 && n < peak) || Date.now() - t0 > 90000) break;
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.setSpeed(0));
  await page.waitForTimeout(500);
  const live = await page.evaluate(() => window.measureEnemies());
  await page.screenshot({ path: `${out}/w${wave}-${cfg.name}-${read}.png` });
  meta[`w${wave}-${cfg.name}-${read}`] = { peak, live };
  console.log(wave, cfg.name, read, 'peak', peak, 'measured', live.length);
  await page.close();
}
writeFileSync(`${out}/meta-${process.env.TAG ?? 'main'}.json`, JSON.stringify(meta));
await browser.close();
server.stop();
