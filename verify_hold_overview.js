/* 统一持仓总览回归测试（jsdom 实跑，零网络）
 * 覆盖：allocData 占比/排序 / renderHomeHold 表格与止盈止损状态徽标 / 空持仓占位 / drawAlloc 环形图绘制
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body>'
  + '<div id="homeHoldBody"></div><canvas id="homeAllocCv" height="220"></canvas>'
  + '<div id="holdAllocWrap"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.save = () => {}; window.goView = () => {};
window.state = { hold: [] };
window.priceOf = (code) => ({ '012863': 0.72, 'sh515790': 1.02, '600519': 1500 }[code] || 0);
window.nameOf = (code) => ({ '012863': '电池ETF联接C', 'sh515790': '光伏ETF', '600519': '贵州茅台' }[code] || code);
window.isFundKind = (code) => code === '012863';
window.kindOf = () => null; // 桩：utils.js isFundKind 依赖 kindOf，回退 isLikelyFundCode
window.paintCanvasMsg = () => {};
// canvas stub：记录绘制操作
const ops = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const c = { clearRect() { ops.push('clear'); }, beginPath() { ops.push('begin'); }, moveTo() { ops.push('move'); },
    arc() { ops.push('arc'); }, closePath() { ops.push('close'); }, fill() { ops.push('fill'); }, stroke() { ops.push('stroke'); },
    fillRect() { ops.push('fillRect'); }, fillText() { ops.push('fillText'); }, set fillStyle(v) {}, set strokeStyle(v) {}, set font(v) {}, set lineWidth(v) {}, set textAlign(v) {} };
  return c;
};
const files = ['js/utils.js', 'js/charts.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }

// —— allocData：占比与排序 ——
window.state.hold = [
  { code: '012863', shares: 27342, cost: 0.8533, target: 0.884, stop: 0.604 },
  { code: 'sh515790', shares: 1000, cost: 1.05 },
  { code: '600519', shares: 100, cost: 1400 },
];
const rows = window.allocData();
A(rows.length === 3, 'allocData 返回全部持仓');
A(rows[0].code === '600519' && rows[1].code === '012863' && rows[2].code === 'sh515790', '按市值降序（茅台150000 > 电池19686 > 光伏1020）');
A(Math.abs(rows[0].pct - 87.87) < 0.05, '茅台占比 ≈87.87%');
A(Math.abs(rows[1].pct - 11.53) < 0.05, '电池占比 ≈11.53%');
A(rows[1].kind === 'fund' && rows[2].kind === 'stock', 'kind 分类正确（基金/股票）');

// —— renderHomeHold：表格与徽标 ——
window.renderHomeHold();
let tb = window.document.getElementById('homeHoldBody').innerHTML;
A(tb.indexOf('贵州茅台') >= 0 && tb.indexOf('电池ETF联接C') >= 0 && tb.indexOf('光伏ETF') >= 0, '总览表含全部持仓名');
A(tb.indexOf('150,000') >= 0, '茅台市值显示 150,000');
A(tb.indexOf('-15.62%') >= 0, '电池收益率 -15.62%（0.72 vs 成本0.8533）');
A(tb.indexOf('87.87%') >= 0, '仓位占比 87.87%');
A(tb.indexOf('hh-badge') < 0, '未到止盈/破止损 → 无徽标');
// 到止盈价 → 徽标
window.state.hold[2].target = 1400; // 茅台 target=1400，现价1500 → 到止盈
window.renderHomeHold();
tb = window.document.getElementById('homeHoldBody').innerHTML;
A(tb.indexOf('🔺 到止盈价') >= 0, '现价≥止盈价 → 显示「🔺 到止盈价」');
// 破止损价 → 徽标
window.state.hold[2].target = 0; window.state.hold[2].stop = 1600; // 止损1600，现价1500 → 破止损
window.renderHomeHold();
tb = window.document.getElementById('homeHoldBody').innerHTML;
A(tb.indexOf('🔻 破止损价') >= 0, '现价≤止损价 → 显示「🔻 破止损价」');
window.state.hold[2].stop = 0;

// —— drawAlloc：环形图绘制 ——
ops.length = 0;
window.drawAlloc('homeAllocCv');
A(ops.indexOf('arc') >= 0 && ops.indexOf('fillText') >= 0, '环形图执行 arc + fillText 绘制');
A(ops.filter(o => o === 'arc').length >= 3, '环形图按持仓数量绘制 ≥3 段');

// —— 空持仓占位 ——
window.state.hold = [];
window.renderHomeHold();
tb = window.document.getElementById('homeHoldBody').innerHTML;
A(tb.indexOf('暂无持仓') >= 0, '空持仓 → 占位提示');
ops.length = 0;
window.drawAlloc('homeAllocCv');
A(ops.filter(o => o === 'arc').length === 0, '空持仓 → 环形图不画扇区（仅提示文字）');

console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 统一持仓总览 全部通过');
process.exit(fails ? 1 : 0);
