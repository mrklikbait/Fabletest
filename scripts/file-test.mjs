// Load the packed single-file build over file:// and report what happens.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type().toUpperCase() + ':', m.text().slice(0, 300)); });

await page.goto('file:///home/user/Fabletest/press-check.html');
await page.waitForTimeout(2500);

const state = await page.evaluate(() => ({
  hasGame: !!window.__game,
  cardHtml: (document.getElementById('card') || {}).innerHTML?.length || 0,
  overlayShown: getComputedStyle(document.getElementById('overlay')).display,
  scripts: [...document.querySelectorAll('script')].map((s) => ({ type: s.type, inline: !s.src, len: (s.textContent || '').length })),
}));
console.log('state:', JSON.stringify(state, null, 2));
await page.screenshot({ path: 'shots/file-test.png' });

// if the title is up, click through and make sure the game itself boots
if (state.cardHtml > 0) {
  await page.click('#go');
  await page.waitForTimeout(2500);
  const g = await page.evaluate(() => ({ state: window.__game?.state, built: window.__game?.built }));
  console.log('after click:', JSON.stringify(g));
  await page.screenshot({ path: 'shots/file-test-game.png' });
}

await browser.close();
console.log('done');
