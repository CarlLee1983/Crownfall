import { chromium } from '/Users/carl/Dev/Carl/Crownfall/node_modules/playwright-core/index.mjs';
const [dist, out, ...pxs] = process.argv.slice(2);
const server = Bun.serve({ port: 0, async fetch(req) {
  const path = new URL(req.url).pathname;
  const file = Bun.file(dist + (path === '/' ? '/index.html' : path));
  return (await file.exists()) ? new Response(file) : new Response('nf', { status: 404 });
}});
const browser = await chromium.launch();
for (const px of pxs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  await page.goto(`http://localhost:${server.port}/?px=${px}`);
  await page.click('#start-game:not([disabled])', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/prep-${px}.png` });
  await page.click('#start-wave');
  await page.waitForTimeout(8000);
  await page.click('#pause');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/wave-${px}.png` });
  await page.close();
}
await browser.close(); server.stop();
