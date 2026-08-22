/* 全量 jsdom 冒烟：按 index.html 真实顺序注入 31 个脚本，
 * 捕获加载期/语法/全局引用错误，并逐一调用各视图入口验证不抛同步异常。
 * 离线网络错误（fetch 失败）预期存在，不计入失败。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;

// 1) 从 index.html 抽取真实 <script src="js/..."> 顺序
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const order = (html.match(/<script src="(js\/[^"]+)"><\/script>/g) || [])
  .map(s => s.replace(/.*src="(js\/[^"]+)".*/, '$1'));
if (!order.length) { console.error('未找到脚本顺序'); process.exit(2); }
html = html.split('\n').filter(l => !/^\s*<script src="js\//.test(l)).join('\n');

const loadErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => loadErrors.push('jsdomError: ' + (e && (e.detail || e.message || e))));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  url: 'file://' + ROOT + '/', beforeParse(w) {
    // canvas 2d 桩
    const noop = () => {};
    const ctxMock = new Proxy({}, { get(_, p) {
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'canvas') return { width: 600, height: 300 };
      return noop;
    }});
    w.HTMLCanvasElement.prototype.getContext = function () { return ctxMock; };
    // fetch 桩：离线环境直接 reject（避免挂起），网络错不计入失败
    w.fetch = () => Promise.reject(new Error('offline-stub'));
    w.XMLHttpRequest = class { open(){} send(){} };
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
    w.cancelAnimationFrame = id => clearTimeout(id);
  }
});
const { window } = dom;
window.addEventListener('error', e => loadErrors.push('window.error: ' + (e.error && e.error.stack || e.message)));

// 2) 按顺序注入脚本
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const s = window.document.createElement('script');
  s.textContent = code;
  try { window.document.body.appendChild(s); }
  catch (e) { loadErrors.push('inject ' + f + ': ' + e.stack); }
}

// 3) 关键全局函数存在性
const need = ['showView','goView','renderHome','renderDict','renderMacro','renderAssetMap',
  'renderAnalysis','renderFlow','renderSectors','renderRotation','renderFundAnalysis',
  'renderDataCenter','renderReview','renderOpportunities','renderSubTabs','playIn'];
const missing = need.filter(n => typeof window[n] !== 'function');

// 4) 调用各视图入口，收集同步异常（异步 fetch 失败不计入）
const syncErrors = [];
function safe(label, fn){ try { fn(); } catch(e){ syncErrors.push(label + ': ' + (e && e.stack || e)); } }
if (typeof window.init === 'function') safe('init', () => window.init());
const views = ['home','market','asset','macro','hold','review','fund','fundAnalysis','sectors','rotation','analysis','flow','datacenter','rebalance','dict'];
views.forEach(v => safe('showView:'+v, () => window.showView(v, true)));
['discovery','radar','timing'].forEach(g => safe('enterGroup:'+g, () => window.enterGroup(g)));

// 5) emoji 残留检测（结构性 chrome emoji 不应再出现）
const KEEP = new Set(['🟢','🔴','🟡','⚪','✅','✓','✗','✕','⚠','🛡','↩','←','→','↑','↓','↗','↙','★','🟥','🟩','❌','✔']);
const emojiPat = /[\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u{1F000}-\u{1FAFF}]/u;
let badEmoji = [];
for (const f of order.concat(['index.html'])) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const m = l.match(emojiPat);
    if (m && !KEEP.has(m[0])) badEmoji.push(f + ':' + (i+1) + ' ' + m[0]);
  });
}

// 6) 汇总
console.log('脚本数:', order.length);
console.log('加载期错误:', loadErrors.length);
loadErrors.slice(0,20).forEach(e => console.log('  -', e));
console.log('缺失关键函数:', missing.length ? missing.join(', ') : '无');
console.log('视图入口同步异常:', syncErrors.length);
syncErrors.slice(0,20).forEach(e => console.log('  -', e));
console.log('意外 emoji 残留:', badEmoji.length);
badEmoji.slice(0,30).forEach(e => console.log('  -', e));

const ok = loadErrors.length === 0 && missing.length === 0 && syncErrors.length === 0 && badEmoji.length === 0;
console.log(ok ? '\n=== SMOKE PASS ===' : '\n=== SMOKE FAIL ===');
process.exit(ok ? 0 : 1);
