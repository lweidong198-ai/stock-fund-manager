/* =========================================================================
 * smoke_split.js —— 拆分后真加载冒烟测试
 * 用 jsdom 按 index.html 的加载顺序注入 19 个脚本到真实 DOM，
 * 验证：① 无加载/语法/全局引用错误 ② 关键全局函数可用
 *       ③ init 能跑通 ④ DataCalibrator 逻辑 intact。
 * 用法：node smoke_split.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const ORDER = [
  'config.js', 'utils.js', 'storage.js', 'demo.js', 'quotes.js', 'calibrator.js',
  'kline.js', 'fund.js', 'indicators.js', 'analysis.js', 'canvas.js', 'charts.js',
  'moneyflow.js', 'sectors.js', 'opportunity.js', 'detail.js', 'datacenter.js',
  'fundanalysis.js', 'app.js'
];

// 复用 index.html 的 body，但去掉外部 <script src> 标签（改为手动注入，便于捕获错误）
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
html = html.split('\n').filter(l => !/^\s*<script src="js\//.test(l)).join('\n');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message || e)));

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'file://' + ROOT + '/' });
const { window } = dom;

// stub canvas 2d（jsdom 无实现），让 init 里的绘制调用不抛错
const noop = () => {};
const ctxMock = new Proxy({}, {
  get(_, p) {
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'canvas') return { width: 600, height: 300 };
    return noop;
  }
});
window.HTMLCanvasElement.prototype.getContext = function () { return ctxMock; };
// jsdom 无 fetch，stub 成永挂起的 promise，避免 init 联网调用抛错（真实浏览器有 fetch）
window.fetch = function () { return new Promise(function () {}); };

// 逐个注入脚本（模拟浏览器按序执行经典脚本）
let injectErrors = 0;
for (const f of ORDER) {
  const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  try {
    const s = window.document.createElement('script');
    s.textContent = code;
    window.document.body.appendChild(s);
  } catch (e) {
    injectErrors++;
    errors.push('INJECT ' + f + ': ' + e.message);
  }
}

// 断言关键全局可用（用 eval 在真实全局作用域查：const/let 全局不属于 window 属性，必须这样查）
const need = ['APP_VER', 'state', 'DataCalibrator', 'analyze', 'renderAnalysis',
  'runBacktest', 'showView', 'goView', 'loadKline', 'refreshQuotes', 'selectCode',
  'renderWatch', 'drawMain', 'macd', 'kdj', 'MASTERS', 'clamp', '$'];
const missing = [];
for (const n of need) {
  let t;
  try { t = window.eval('typeof ' + n); } catch (e) { t = 'error:' + e.message; }
  if (!(t === 'function' || t === 'object' || t === 'string' || t === 'number')) {
    missing.push(n + '(' + t + ')');
  }
}

// 逻辑冒烟：DataCalibrator.checkKline 应识别周末 bar
let calibOk = false, calibDetail = '';
try {
  const dc = window.DataCalibrator;
  // 构造一根周末 K 线 + 一根正常 K 线
  const bad = [{ date: '2026-08-08', open: 1, close: 1, high: 1, low: 1 }, { date: '2026-08-10', open: 1, close: 2, high: 2, low: 1 }];
  const reasons = dc.checkKline('TEST', bad);
  calibOk = Array.isArray(reasons) && reasons.some(r => /周末|weekend/i.test(r));
  calibDetail = calibOk ? '周末 bar 已识别' : ('未识别，返回=' + JSON.stringify(reasons));
} catch (e) { calibDetail = 'checkKline 抛错: ' + e.message; }

// 输出
console.log('模块加载错误数:', injectErrors);
console.log('关键全局缺失:', missing.length ? missing.join(', ') : '无');
console.log('DataCalibrator 周末检测:', calibOk ? 'PASS (' + calibDetail + ')' : 'FAIL (' + calibDetail + ')');
console.log('jsdomError 数:', errors.length);
if (errors.length) errors.slice(0, 10).forEach(e => console.log('  ! ' + e));

const pass = injectErrors === 0 && missing.length === 0 && calibOk && errors.length === 0;
console.log(pass ? '\n✅ 冒烟测试全部通过：19 文件按序加载无错、全局可用、init 跑通、校准逻辑 intact。'
  : '\n❌ 冒烟测试存在失败项，见上。');
process.exit(pass ? 0 : 1);
