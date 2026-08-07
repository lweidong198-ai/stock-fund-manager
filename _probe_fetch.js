const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh516780,day,2026-04-20,2026-06-20,60,qfq&_='+Date.now();
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u);
      const text = await res.text();
      return { ok: res.ok, status: res.status, len: text.length, head: text.slice(0, 200) };
    } catch (e) { return { err: e.message }; }
  }, url);
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => console.error(e));
