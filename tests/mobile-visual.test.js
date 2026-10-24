const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const url = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });

  async function open(name, width, height) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `/private/tmp/huanghun-${name}.png` });
    return page;
  }

  const portrait = await open('390x844-rotate', 390, 844);
  assert.equal(await portrait.locator('#rotate-gate').evaluate(el => getComputedStyle(el).display), 'flex');
  assert.equal(await portrait.locator('#rotate-gate').getAttribute('aria-hidden'), 'false');
  await portrait.locator('#rotate-continue').click();
  assert.equal(await portrait.locator('body').evaluate(el => el.classList.contains('portrait-allowed')), true);
  assert.equal(await portrait.locator('#rotate-gate').evaluate(el => getComputedStyle(el).display), 'none');
  assert.ok(await portrait.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '竖屏继续后不应横向溢出');
  await portrait.screenshot({ path: '/private/tmp/huanghun-390x844-continued.png' });
  await portrait.close();

  for (const [name, width, height] of [['844x390', 844, 390], ['667x375', 667, 375]]) {
    const page = await open(name, width, height);
    const classes = await page.locator('body').getAttribute('class') || '';
    assert.match(classes, /mobile-landscape/);
    assert.equal(await page.locator('#rotate-gate').evaluate(el => getComputedStyle(el).display), 'none');
    const frame = await page.locator('#frame').boundingBox();
    assert.ok(Math.abs(frame.width / frame.height - 16 / 9) < 0.01, `${name} 画框必须保持 16:9`);

    await page.evaluate(() => {
      document.querySelector('#title').hidden = true;
      document.querySelector('#bar').hidden = false;
      const choice = document.querySelector('#choice');
      choice.hidden = false;
      choice.innerHTML = '<div class="q">你准备怎么回应？</div><div class="opts"><button class="opt"><span class="k">1</span><span>先听她把话说完</span></button><button class="opt"><span class="k">2</span><span>问清楚现实安排</span></button></div>';
    });
    const toolbar = await page.locator('#bar').boundingBox();
    assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= width + 0.5, `${name} 工具栏不得越界`);
    const heights = await page.locator('#bar button, #choice .opt').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
    assert.ok(heights.every(h => h >= 44), `${name} 所有主要触控目标至少 44px`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} 不应横向溢出`);
    await page.screenshot({ path: `/private/tmp/huanghun-${name}-controls.png` });
    await page.close();
  }

  const desktop = await open('1440x900-desktop', 1440, 900);
  const desktopClasses = await desktop.locator('body').getAttribute('class') || '';
  assert.doesNotMatch(desktopClasses, /mobile-landscape|portrait/);
  assert.equal(await desktop.locator('#rotate-gate').evaluate(el => getComputedStyle(el).display), 'none');
  await desktop.close();

  await browser.close();
  console.log('mobile visual contract: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
