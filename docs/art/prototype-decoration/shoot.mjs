import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
const [dist, out, w, h, dpr, ...vs] = process.argv.slice(2);
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const p = new URL(req.url).pathname; const f = Bun.file(dist + (p === '/' ? '/index.html' : p));
  return (await f.exists()) ? new Response(f) : new Response('nf', { status: 404 }); } });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const W = 11;
for (const v of vs) {
  const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()));
  await page.goto(`http://127.0.0.1:${server.port}/?px=2&decor=${v}`);
  await page.waitForFunction(() => !document.getElementById('start-game').disabled, null, { timeout: 30000 });
  await page.click('#start-game');
  await page.waitForTimeout(600);
  console.log(v, JSON.stringify(await page.evaluate(() => window.decorStats)));
  await page.evaluate(() => {
    const place = (x, y, kind) => window.enqueue((tick) => ({ type: 'placeTower', cell: y * 11 + x, kind, tick }));
    place(6, 4, 'basic'); place(4, 4, 'sniper'); place(2, 2, 'splash'); place(9, 9, 'basic'); place(5, 10, 'splash'); place(8, 4, 'sniper');
  });
  await page.waitForTimeout(500);
  await page.click('#start-wave');
  await page.waitForTimeout(8000);
  await page.click('#pause');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${v}.png` });
  await page.context().close();
}
await browser.close(); server.stop();
