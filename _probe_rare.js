const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8099/stock-fund-manager.html';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const logs = [];
  page.on('console', m => logs.push('PAGE:' + m.text()));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // 切到行情看板并选中稀土ETF华泰柏瑞
  await page.evaluate(() => {
    showView('market');
    if (!state.watch.some(w => w.code === 'sh516780')) state.watch.push({ code: 'sh516780', kind: 'stock', name: '稀土ETF华泰柏瑞' });
    selectCode('sh516780');
  });
  await page.waitForFunction(() => state && state.kcache && state.kcache['sh516780d'] && state.kcache['sh516780d'].length > 30, { timeout: 20000 });

  // 等 BOLL 指标开启 + 渲染
  await page.evaluate(() => { if(!state.ind.boll){ /* 默认应已开 */ } drawAll && drawAll(); });
  await new Promise(r => setTimeout(r, 1500));

  // 导出数值
  const rows = await page.evaluate(() => {
    const kl = state.kcache['sh516780d'];
    if(!kl) return { err: 'no kcache' };
    const closes = kl.map(x => x.close);
    const b = boll(closes, 20);
    const rows = kl.map((k, i) => ({
      date: k.date, o: k.open, h: k.high, l: k.low, c: k.close, v: k.vol,
      mid: b.mid[i], up: b.up[i], low: b.low[i],
      width: b.mid[i] != null ? +((b.up[i] - b.low[i]) / b.mid[i]).toFixed(4) : null
    }));
    return { len: rows.length, rows };
  });

  // 截默认视图（含5月左侧）
  await page.screenshot({ path: 'C:\\Users\\Mloong\\stock-fund-manager\\_rare_default.png' });

  // 把视口拉到5月附近：找 2026-05-15 的索引，窗口60根
  const idxInfo = await page.evaluate(() => {
    const kl = state.kcache['sh516780d'];
    let target = -1;
    for (let i = 0; i < kl.length; i++) { if (kl[i].date >= '2026-05-15') { target = i; break; } }
    return { target };
  });
  const cv = await page.$('#klineMain');
  await page.evaluate((ti) => {
    const c = document.getElementById('klineMain');
    c._vp = { start: Math.max(0, ti - 30), count: 80 };
    drawAll && drawAll();
  }, idxInfo.target);
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'C:\\Users\\Mloong\\stock-fund-manager\\_rare_may.png' });

  await browser.close();

  // 分析：5月窗口 + 日期连续性 + 异常
  if (rows.err) { console.log('ERR', rows.err); return; }
  const all = rows.rows;
  console.log('总条数=', all.length, ' 首=', all[0].date, ' 末=', all[all.length-1].date);
  const win = all.filter(r => r.date >= '2026-04-20' && r.date <= '2026-06-20');
  console.log('\n=== 4/20-6/20 每日(收/中轨/上轨/下轨/轨道宽) ===');
  win.forEach(r => console.log(`${r.date} 收${r.c.toFixed(3)} 中${r.mid!=null?r.mid.toFixed(3):'--'} 上${r.up!=null?r.up.toFixed(3):'--'} 下${r.low!=null?r.low.toFixed(3):'--'} 宽${r.width}`));

  // 日期连续性
  console.log('\n=== 日期连续性检查（相邻间隔>5天视为缺口）===');
  let gaps = [];
  for (let i = 1; i < all.length; i++) {
    const a = new Date(all[i-1].date), b = new Date(all[i].date);
    const d = (b - a) / 86400000;
    if (d > 5) gaps.push(`${all[i-1].date} -> ${all[i].date} (${d}天)`);
  }
  console.log(gaps.length ? gaps.join('\n') : '无异常缺口');

  // 异常值：收盘=0 或 跳变>15%
  console.log('\n=== 异常值检查（收盘=0 或 单日跳变>15%）===');
  let anomalies = [];
  for (let i = 1; i < all.length; i++) {
    if (all[i].c <= 0) anomalies.push(`${all[i].date} 收盘=0!!`);
    const chg = Math.abs(all[i].c - all[i-1].c) / (all[i-1].c || 1);
    if (chg > 0.15) anomalies.push(`${all[i].date} 跳变${(chg*100).toFixed(1)}% (${all[i-1].c.toFixed(3)}→${all[i].c.toFixed(3)})`);
  }
  console.log(anomalies.length ? anomalies.join('\n') : '无异常值');

  fs.writeFileSync('C:\\Users\\Mloong\\stock-fund-manager\\_rare_data.json', JSON.stringify(win, null, 1));
  console.log('\n已导出 _rare_data.json');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
