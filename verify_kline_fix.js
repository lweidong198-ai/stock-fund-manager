/* =========================================================================
 * verify_kline_fix.js —— K线拖动 bug 验收（修复前应 FAIL，修复后应全 PASS）
 * bug 现象：拖动查看K线时图变成「一条线」
 * 根因1：腾讯周线前复权对早期数据算出负价（茅台126根 low=-186），
 *        sanitizeKline 只滤周末不校验价格 → lo 被拉到 -190 → 蜡烛压成一条线
 * 根因2：持仓止盈/止损填错(多打一个0)也会把价格区间拉爆
 * 根因3：放大后小幅拖动 di=round(dx/ppi)=0 但 lastX 已更新 → 位移丢失拖不动
 * 用法：node verify_kline_fix.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const ORDER = ['config.js', 'utils.js', 'storage.js', 'demo.js', 'quotes.js', 'calibrator.js',
  'kline.js', 'fund.js', 'indicators.js', 'analysis.js', 'canvas.js', 'charts.js',
  'moneyflow.js', 'sectors.js', 'opportunity.js', 'detail.js', 'datacenter.js',
  'fundanalysis.js', 'app.js'];
const CSS_W = 900, CSS_H = 420;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res(b));
    }).on('error', rej);
  });
}
async function fetchKl(code, ptype) {
  const today = new Date().toISOString().slice(0, 10);
  const f = ptype === 'week' ? 'qfqweek' : 'qfqday';
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + code +
    ',' + ptype + ',1990-01-01,' + today + ',640,qfq&_=' + Date.now() + Math.random();
  const j = JSON.parse(await get(url));
  const d = ((j.data || {})[code]) || {};
  const rows = (d[f] && d[f].length) ? d[f] : (d[ptype] || []);
  // 与线上 rowsToKl 完全一致（含 close>0 过滤）
  return rows.map(x => ({ date: x[0], open: +x[1], high: +x[3], low: +x[4], close: +x[2], vol: +x[5] }))
    .filter(x => x.close > 0 && x.date);
}

let pass = true; const log = [];
function check(name, cond, detail) {
  if (cond) log.push('✅ ' + name + (detail ? ' · ' + detail : ''));
  else { pass = false; log.push('❌ ' + name + (detail ? ' · ' + detail : '')); }
}

(async () => {
  console.log('==== 拉真实数据（茅台周线：已知含负价脏值） ====');
  const klW = await fetchKl('sh600519', 'week');
  const klD = await fetchKl('sh600519', 'day');
  const rawBad = klW.filter(k => !(k.low > 0) || !(k.high > 0) || !(k.open > 0)).length;
  console.log('周线 n=' + klW.length + '  原始负价/非正价根数 =' + rawBad);
  check('测试前提：真实周线确实含脏值（否则本用例无意义）', rawBad > 0, '脏值 ' + rawBad + ' 根');

  // ---------- jsdom ----------
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  html = html.split('\n').filter(l => !/^\s*<script src="js\//.test(l)).join('\n');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message || e)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'file://' + ROOT + '/' });
  const { window } = dom;

  const REC = { rects: [], active: null };
  const noop = () => {};
  window.HTMLCanvasElement.prototype.getContext = function () {
    const tag = this.id;
    return new Proxy({}, {
      get(_, p) {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'canvas') return { width: CSS_W, height: CSS_H };
        if (p === 'fillRect') return (x, y, w, h) => { if (REC.active === tag) REC.rects.push({ x, y, w, h }); };
        return noop;
      }
    });
  };
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: CSS_W, height: CSS_H, right: CSS_W, bottom: CSS_H, x: 0, y: 0 };
  };
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return CSS_W; } });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return CSS_H; } });
  window.fetch = function () { return new Promise(function () {}); };

  for (const f of ORDER) {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    window.document.body.appendChild(s);
  }
  check('19 个模块真加载无错', errors.length === 0, errors.slice(0, 2).join(';') || '0 error');

  const cv = window.document.getElementById('klineMain');

  /* ---------- A. sanitizeKline 必须清洗掉非正价格 ---------- */
  window.__RAWW = JSON.stringify(klW);
  window.eval('window.__W = sanitizeKline(JSON.parse(window.__RAWW));');
  const cleanW = window.__W;
  const stillBad = cleanW.filter(k => !(k.low > 0) || !(k.high > 0) || !(k.open > 0) || !(k.close > 0)).length;
  const negIdx = cleanW.map((k, i) => [i, k.low]).filter(x => !(x[1] > 0)).slice(0, 5);
  console.log('DEBUG cleanW 非正价: ' + stillBad + ' 根；前几个负low索引/值: ' + JSON.stringify(negIdx));
  check('A1 sanitizeKline 清除全部非正价格 bar', stillBad === 0, '残留 ' + stillBad + ' 根 / 共 ' + cleanW.length);
  const ohlcBad = cleanW.filter(k => k.high < k.low || k.high < k.close || k.low > k.close).length;
  check('A2 清洗后 OHLC 关系自洽(high≥close≥low)', ohlcBad === 0, '违规 ' + ohlcBad + ' 根');
  check('A3 清洗未误伤有效数据（保留≥80%）', cleanW.length >= klW.length * 0.8, cleanW.length + '/' + klW.length);

  /* ---------- B. 拖到最早区间不得压成一条线 ---------- */
  window.eval('state.selected="sh600519"; state.period="w"; state.kcache["sh600519w"]=window.__W;');
  function drawAt(start, count) {
    window.drawAll(cleanW);
    cv._vp.start = start; cv._vp.count = count; cv._vp.n = cleanW.length;
    REC.rects = []; REC.active = 'klineMain';
    window.drawMain(cleanW);   // 直接调，绕开 drawAll 副图，确保只测主图
    const sub0 = cleanW.slice(start, start + count)[0];
    console.log('   [drawAt] 首根=' + JSON.stringify(sub0));
    const ys = REC.rects.map(r => r.y).filter(v => isFinite(v));
    return {
      lo: cv._lo, hi: cv._hi, rects: REC.rects.length,
      ySpan: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
      nan: REC.rects.filter(r => !isFinite(r.x) || !isFinite(r.y)).length
    };
  }
  const early = drawAt(0, 250);
  console.log('  [最早250根] lo=' + early.lo + ' hi=' + early.hi + ' y跨度=' + early.ySpan.toFixed(1) + ' 矩形=' + early.rects);
  check('B1 拖到最早区间：价格下界不为负', early.lo > 0, 'lo=' + (early.lo != null ? early.lo.toFixed(2) : '?'));
  check('B2 拖到最早区间：蜡烛未压成一条线(y跨度>60px)', early.ySpan > 60, 'y跨度=' + early.ySpan.toFixed(1) + 'px');
  check('B3 无 NaN 坐标', early.nan === 0, 'NaN矩形=' + early.nan);

  const mid = drawAt(Math.floor(cleanW.length / 2), 250);
  check('B4 中段区间同样正常', mid.lo > 0 && mid.ySpan > 60, 'lo=' + mid.lo.toFixed(2) + ' y跨度=' + mid.ySpan.toFixed(1));
  const latest = drawAt(Math.max(0, cleanW.length - 250), 250);
  check('B5 最新区间正常', latest.lo > 0 && latest.ySpan > 60, 'lo=' + latest.lo.toFixed(2) + ' y跨度=' + latest.ySpan.toFixed(1));

  /* ---------- C. 持仓参考线填错不得拉爆价格区间 ---------- */
  window.eval('state.selected="sh600519"; state.period="d"; state.kcache["sh600519d"]=JSON.parse(window.__RAWD||"[]");');
  window.__RAWD = JSON.stringify(klD);
  window.eval('window.__D = sanitizeKline(JSON.parse(window.__RAWD)); state.kcache["sh600519d"]=window.__D;');
  const cleanD = window.__D;
  const lastClose = cleanD[cleanD.length - 1].close;
  // 止盈多打一个0
  window.eval('state.hold=[{code:"sh600519",qty:100,cost:' + (lastClose * 0.9).toFixed(2) +
    ',target:' + (lastClose * 10).toFixed(2) + ',stop:' + (lastClose * 0.8).toFixed(2) + '}];');
  window.drawAll(cleanD);
  cv._vp.start = Math.max(0, cleanD.length - 250); cv._vp.count = 250; cv._vp.n = cleanD.length;
  REC.rects = []; REC.active = 'klineMain';
  window.drawAll(cleanD);
  const ysC = REC.rects.map(r => r.y).filter(v => isFinite(v));
  const spanC = ysC.length ? Math.max(...ysC) - Math.min(...ysC) : 0;
  console.log('  [止盈多打个0] lo=' + cv._lo.toFixed(1) + ' hi=' + cv._hi.toFixed(1) + ' y跨度=' + spanC.toFixed(1));
  check('C1 参考线离谱时不得把K线压扁(y跨度>60px)', spanC > 60, 'y跨度=' + spanC.toFixed(1) + 'px');
  window.eval('state.hold=[];');

  /* ---------- D. 放大后小幅拖动必须能拖动 ---------- */
  window.eval('state.period="d";');
  window.drawAll(cleanD);
  cv._vp.count = 20; cv._vp.start = cleanD.length - 20; cv._vp.n = cleanD.length;
  window.bindKlineInteractions && window.bindKlineInteractions();
  function md(x) {
    const e = new window.MouseEvent('mousedown', { button: 0, clientX: x, clientY: 100, bubbles: true });
    Object.defineProperty(e, 'offsetX', { get: () => x });
    Object.defineProperty(e, 'offsetY', { get: () => 100 });
    cv.dispatchEvent(e);
  }
  const mm = x => window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: 100, bubbles: true }));
  const mu = () => window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  const s0 = cv._vp.start;
  md(400); mm(410); mm(420); mm(430); mm(440); mm(450); mu();   // 累计右移 50px，放大态 ppi≈45 → 应移动 1 格以上
  const s1 = cv._vp.start;
  check('D1 放大态小幅拖动有效(累计50px应改变视窗)', s1 !== s0, 'start ' + s0 + ' → ' + s1);

  /* ---------- E. 一键回到最新 ---------- */
  cv._vp.start = 0;
  const hasBtn = !!window.document.getElementById('btnGoLatest');
  check('E1 存在「回到最新」按钮', hasBtn, hasBtn ? '#btnGoLatest' : '缺失');
  if (hasBtn) {
    window.document.getElementById('btnGoLatest').click();
    check('E2 点击后视窗回到最右端', cv._vp.start === cleanD.length - cv._vp.count,
      'start=' + cv._vp.start + ' 期望=' + (cleanD.length - cv._vp.count));
  }

  /* ---------- F. 运行时错误 ---------- */
  check('F1 全过程 jsdom 运行时错误为 0', errors.length === 0, errors.slice(0, 3).join(' | ') || '0');

  console.log('\n==== 验收结果 ====');
  log.forEach(l => console.log(l));
  console.log('\n' + (pass ? '🎉 全部通过' : '⛔ 存在 FAIL'));
  process.exit(pass ? 0 : 1);
})();
