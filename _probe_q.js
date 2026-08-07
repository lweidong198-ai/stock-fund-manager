const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8099/stock-fund-manager.html';

async function inspect(page, code, label) {
  await page.evaluate((c) => {
    showView('market');
    if (!state.watch.some(w => w.code === c)) state.watch.push({ code: c, kind: 'stock', name: '' });
    selectCode(c);
  }, code);
  await page.waitForFunction((c) => state && state.kcache && state.kcache[c + 'd'] && state.kcache[c + 'd'].length > 30, { timeout: 20000 }, code);
  await new Promise(r => setTimeout(r, 1200));
  const info = await page.evaluate((c, lbl) => {
    const kl = state.kcache[c + 'd'];
    const closes = kl.map(x => x.close);
    function sma(a, n) { const o = []; for (let i = 0; i < a.length; i++) { if (i < n - 1) { o.push(null); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; o.push(s / n); } return o; }
    function boll(c, n = 20, k = 2) { const mid = sma(c, n), up = [], low = []; for (let i = 0; i < c.length; i++) { if (mid[i] == null) { up.push(null); low.push(null); continue; } let s = 0; for (let t = i - n + 1; t <= i; t++) { const d = c[t] - mid[i]; s += d * d; } const sd = Math.sqrt(s / n); up.push(mid[i] + k * sd); low.push(mid[i] - k * sd); } return { mid, up, low }; }
    const b = boll(closes);
    const win = kl.map((k, i) => ({ date: k.date, c: k.close, w: b.mid[i] != null ? +((b.up[i] - b.low[i]) / b.mid[i]).toFixed(4) : null })).filter(x => x.date >= '2026-05-15' && x.date <= '2026-06-10');
    const maxW = Math.max(...win.map(x => x.w || 0));
    const maxJump = win.reduce((m, x, i, a) => { if (!i) return m; const chg = Math.abs(x.c - a[i - 1].c) / a[i - 1].c; return Math.max(m, chg); }, 0);
    return { label: lbl, len: kl.length, first: kl[0].date, last: kl[kl.length - 1].date, maxBollWidth: maxW, maxSingleDayJump: maxJump, sample: win.slice(0, 6) };
  }, code, label);
  await page.screenshot({ path: `C:\\Users\\Mloong\\stock-fund-manager\\_q_${code.replace(/[^a-z0-9]/ig, '')}.png` });
  return info;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

  const r1 = await inspect(page, 'sh516780', '稀土ETF华泰柏瑞');
  const r2 = await inspect(page, 'sh600519', '贵州茅台');

  console.log('=== 稀土ETF (应无大圆) ===');
  console.log(JSON.stringify(r1, null, 1));
  console.log('=== 贵州茅台 (回归对照) ===');
  console.log(JSON.stringify(r2, null, 1));

  const pass = r1.maxBollWidth < 0.35 && r1.maxSingleDayJump < 0.15 && r2.len > 30;
  console.log('\nVERDICT:', pass ? 'PASS ✅' : 'FAIL ❌', '(稀土ETF BOLL宽<0.35 & 单日跳<15% & 茅台有数据)');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
