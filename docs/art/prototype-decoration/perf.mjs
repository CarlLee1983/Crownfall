import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
const dist = process.argv[2];
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const p = new URL(req.url).pathname; const f = Bun.file(dist + (p === '/' ? '/index.html' : p));
  return (await f.exists()) ? new Response(f) : new Response('nf', { status: 404 }); } });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pct = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
for (const v of ['a', 'b', 'c', 'd']) {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`http://127.0.0.1:${server.port}/?px=2&decor=${v}`);
  await page.waitForFunction(() => !document.getElementById('start-game').disabled, null, { timeout: 30000 });
  await page.click('#start-game');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const place = (x, y, kind) => window.enqueue((tick) => ({ type: 'placeTower', cell: y * 11 + x, kind, tick }));
    place(6, 4, 'basic'); place(4, 4, 'sniper'); place(2, 2, 'splash'); place(9, 9, 'basic'); place(5, 10, 'splash'); place(8, 4, 'sniper');
    const r = window.renderer; r.info.autoReset = false; r.info.reset();
    window.__s = { calls: [], tris: [] };
    const tick = () => { const i = r.info.render; if (i.calls > 0) { window.__s.calls.push(i.calls); window.__s.tris.push(i.triangles); } r.info.reset(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(500);
  await page.click('#start-wave');
  await page.waitForTimeout(25000);
  const s = await page.evaluate(() => window.__s);
  console.log(JSON.stringify({ v, frames: s.calls.length, callsP50: pct(s.calls, .5), callsMax: Math.max(...s.calls), trisP50: pct(s.tris, .5), trisMax: Math.max(...s.tris) }));
  await page.context().close();
}
await browser.close(); server.stop();
