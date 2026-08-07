const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid=1.516780&klt=101&fqt=1&beg=20260401&end=20260630';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const rows = await page.evaluate(async (url) => {
    function sma(a, n) { const o = []; for (let i = 0; i < a.length; i++) { if (i < n - 1) { o.push(null); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; o.push(s / n); } return o; }
    function boll(c, n = 20, k = 2) { const mid = sma(c, n), up = [], low = []; for (let i = 0; i < c.length; i++) { if (mid[i] == null) { up.push(null); low.push(null); continue; } let s = 0; for (let t = i - n + 1; t <= i; t++) { const d = c[t] - mid[i]; s += d * d; } const sd = Math.sqrt(s / n); up.push(mid[i] + k * sd); low.push(mid[i] - k * sd); } return { mid, up, low }; }
    try {
      const r = await fetch(url, { referrer: 'https://emweb.securities.eastmoney.com/' });
      const j = await r.json();
      const k = j.data.klines.map(s => { const a = s.split(','); return { date: a[0], c: +a[3] }; });
      const b = boll(k.map(x => x.c));
      return k.map((x, i) => ({ date: x.date, c: x.c, w: b.mid[i] != null ? ((b.up[i] - b.low[i]) / b.mid[i]).toFixed(4) : null })).filter(x => x.date >= '2026-05-15' && x.date <= '2026-06-10');
    } catch (e) { return { err: e.message }; }
  }, URL);
  console.log(rows.err ? 'ERR ' + rows.err : JSON.stringify(rows, null, 1));
  await browser.close();
})().catch(e => console.error(e));
