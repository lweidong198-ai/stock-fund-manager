/* 多维信号灯+买卖检查清单回归测试（jsdom 实跑，零网络）
 * 覆盖：纯辅助(smaOf/percentileOf/klinePctFromArray) / ETF四灯 / 基金净值灯 /
 *      追高检查 / 检查清单逐条确认(未勾拦截+全勾放行) / renderSignalLights渲染
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body>'
  + '<div class="sig-strip" id="dSignal"></div>'
  + '<div id="checkModal" style="display:none;"><div id="checkTitle"></div><div id="checkStrip"></div><div id="checkExtra"></div><div id="checkItems"></div></div>'
  + '</body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.__toast = []; window.toast = (m) => window.__toast.push(m); window.goView = () => {};
window.isFundKind = (c) => String(c).replace(/^(sh|sz)/, '') === '012863';
window.kindOf = () => null;
window.fmtMoney = (v) => (v >= 0 ? '+' : '') + (Math.abs(v) / 1e8).toFixed(2) + '亿';
window.nameOf = (c) => ({ 'sh515790': '光伏ETF', '012863': '电池ETF联接C' }[c] || c);

/* —— 造数据：前80%从hi缓降到dipTo，后20%微升到cur（保证当前价贴近区间低位但站上MA20）—— */
function mkCloses(len, opts){
  const { lo = 100, hi = 200, dipTo = 100, cur = 110 } = opts || {};
  const out = [];
  const n1 = Math.floor(len * 0.8), n2 = len - n1;
  for (let i = 0; i < n1; i++) out.push(hi - (hi - dipTo) * (i / Math.max(1, n1 - 1)));
  for (let i = 0; i < n2; i++) out.push(dipTo + (cur - dipTo) * (i / Math.max(1, n2 - 1)));
  out[out.length - 1] = cur;
  return out;
}
const klLow = mkCloses(300, { dipTo: 100, cur: 110 });   // 当前价低位、近20日微升 → 分位低+站上MA20+跑赢
const klHigh = mkCloses(300, { dipTo: 100, cur: 195 });  // 当前价高位 → 分位红
const benchKl = mkCloses(300, { dipTo: 100, cur: 105 }); // 基准涨得少 → ETF 跑赢
function klineOf(closes){ return closes.map((c, i) => ({ date: '2026-01-' + String((i % 28) + 1).padStart(2, '0'), open: c, close: c, high: c + 1, low: c - 1, vol: 1000000 })); }

window.state = {
  kcache: { 'sh515790d': klineOf(klLow) },
  fundData: { '012863': { name: '电池ETF联接C', latest: klLow[klLow.length - 1], prev: 1, nav: klLow.map((v, i) => ({ t: Date.UTC(2026, 0, i % 28 + 1), nav: v })) } }
};
window.loadKlineP = async (code) => { if (code === 'sh000300') return klineOf(benchKl); return window.state.kcache[code + 'd'] || null; };
window.fetchEMKline = async () => null;
window.klinePct = (kl, n) => { if (!kl || kl.length < n + 1) return null; const a = kl[kl.length - n - 1].close, b = kl[kl.length - 1].close; return (b - a) / a * 100; };
window.calcMacdFull = (closes) => ({ state: closes.map(() => 'bull') }); // 默认MACD多头
window.INDUSTRY_POOL = [{ name: '光伏', code: '515790', etf: '' }];
window.__pan = {
  loadFundFlowDays: (code, days, cb) => cb({ err: null, days: [1e8, 2e8, 3e8, 4e8, 5e8], last: 5e8, sum: 15e8, cont: 5 }),
  contPos: (arr) => 5
};
window.__bench60Cache = null;

const files = ['js/utils.js', 'js/signals.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— 纯辅助函数 —');
  A(window.smaOf([1, 2, 3, 4, 5], 3) === 4, 'smaOf：5日数组20日均值[3,4,5]=4');
  A(window.smaOf([1, 2], 3) === null, 'smaOf：数据不足返回 null');
  A(Math.abs(window.percentileOf([100, 150, 200, 105], 250) - 0.05) < 0.001, 'percentileOf：当前105在100~200区间=0.05');
  A(window.percentileOf([1], 250) === null, 'percentileOf：数据不足返回 null');
  A(window.klinePctFromArray([100, 110, 120], 2) === 20, 'klinePctFromArray：2日前100→120=+20%');

  console.log('— ETF 四灯（低位+多头+跑赢+资金流入） —');
  const l1 = await window.signalLights('sh515790');
  A(l1.val.state === 'green', '估值灯：分位<30% → 绿');
  A(l1.tech.state === 'green', '技术灯：站上20日线+MACD多头 → 绿');
  A(l1.trend.state === 'green', '趋势灯：跑赢沪深300 → 绿');
  A(l1.fund.state === 'green', '资金灯：连续净流入 → 绿');
  A(l1.fund.text.indexOf('连续净流入') >= 0, '资金灯文案：连续净流入N日');

  console.log('— ETF 高位 → 估值灯红 —');
  window.state.kcache['sh515790d'] = klineOf(klHigh);
  window.__bench60Cache = null;
  const l2 = await window.signalLights('sh515790');
  A(l2.val.state === 'red', '估值灯：分位>70% → 红');

  console.log('— 技术灯破位 → 红 —');
  const klBreak = mkCloses(300, { lo: 100, hi: 200, cur: 90 });
  window.state.kcache['sh515790d'] = klineOf(klBreak);
  window.__bench60Cache = null;
  window.calcMacdFull = (closes) => ({ state: closes.map(() => 'bear') });
  const l3 = await window.signalLights('sh515790');
  A(l3.tech.state === 'red', '技术灯：跌破20日线+MACD空头 → 红');
  window.calcMacdFull = (closes) => ({ state: closes.map(() => 'bull') });

  console.log('— 基金净值版（012863） —');
  const l4 = await window.signalLights('012863');
  A(l4.val.state === 'green', '基金估值灯：净值分位<30% → 绿');
  A(l4.tech.state === 'green', '基金技术灯：净值站上20日线+MACD多头 → 绿');
  A(l4.fund.state === 'gray' && l4.fund.detail.indexOf('资金流') >= 0, '基金资金灯：无资金流 → 灰（诚实标注）');

  console.log('— 资金源不可达 → 灰 —');
  window.__pan.loadFundFlowDays = (code, days, cb) => cb({ err: 'net' });
  window.state.kcache['sh515790d'] = klineOf(klLow);
  window.__bench60Cache = null;
  const l5 = await window.signalLights('sh515790');
  A(l5.fund.state === 'gray' && l5.fund.text.indexOf('源不可达') >= 0, '资金源连不上 → 灰+「源不可达」');

  console.log('— renderSignalLights 渲染四行 —');
  window.renderSignalLights('dSignal', 'sh515790');
  await wait(60);
  const sig = window.document.getElementById('dSignal').innerHTML;
  A(sig.indexOf('估值灯') >= 0 && sig.indexOf('资金灯') >= 0 && sig.indexOf('技术灯') >= 0 && sig.indexOf('趋势灯') >= 0, '信号条渲染四灯');
  A(sig.indexOf('sig-row') >= 0, '信号条含灯卡元素');

  console.log('— 买卖检查清单 —');
  window.openChecklist('sh515790', 'buy');
  A(window.document.getElementById('checkModal').style.display === 'block', '买入检查弹窗打开');
  A(window.document.getElementById('checkTitle').textContent.indexOf('买入前检查') >= 0, '标题=买入前检查');
  let items = window.document.getElementById('checkItems').innerHTML;
  A(items.indexOf('1 年内不需要动用') >= 0 && items.indexOf('止损位') >= 0 && items.indexOf('买入理由') >= 0, '买入清单3项');
  A(window.document.getElementById('checkItems').querySelectorAll('input[data-ci]').length === 3, '买入清单3个勾选框');
  const extraTxt = window.document.getElementById('checkExtra').innerHTML;
  A(extraTxt.indexOf('无明显追高') >= 0, '追高检查：近5日无大涨 → 绿提示');
  // 未勾选 → 拦截
  window.__toast = [];
  window.confirmChecklist();
  A(window.__toast.length === 1 && window.__toast[0].indexOf('再想想') >= 0, '未勾全 → 拦截并提示');
  A(window.document.getElementById('checkModal').style.display === 'block', '未勾全 → 弹窗不关');
  // 全勾 → 放行
  const boxes = window.document.getElementById('checkItems').querySelectorAll('input[data-ci]');
  boxes.forEach(b => { b.checked = true; });
  window.__toast = [];
  window.confirmChecklist();
  A(window.__toast.some(t => t.indexOf('已确认计划') >= 0), '全勾 → 放行并提示「已确认计划」');
  A(window.document.getElementById('checkModal').style.display === 'none', '全勾 → 弹窗关闭');
  // 卖出清单2项
  window.openChecklist('012863', 'sell');
  A(window.document.getElementById('checkTitle').textContent.indexOf('卖出前检查') >= 0, '标题=卖出前检查');
  items = window.document.getElementById('checkItems').innerHTML;
  A(items.indexOf('跌怕了') >= 0 && items.indexOf('空仓焦虑') >= 0, '卖出清单2项（情绪反问）');
  A(window.document.getElementById('checkItems').querySelectorAll('input[data-ci]').length === 2, '卖出清单2个勾选框');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 多维信号灯+检查清单 全部通过');
  process.exit(fails ? 1 : 0);
})();
