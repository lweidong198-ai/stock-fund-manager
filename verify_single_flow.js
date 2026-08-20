/* 单ETF资金流查询回归测试（jsdom 实跑，零网络）
 * 场景：资金走向区块内嵌查询条（下拉+自定义代码+5/10/20/60日按钮）
 * 验证：查询条渲染 / 下拉查询 / 自定义代码查询 / 天数切换 / 回总览 / loadFundFlowDays lmt
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body>'
  + '<div id="panGlobal"></div><div id="panHeat"></div><div id="panFund"></div><div id="panOpps"></div><div id="panNews"></div>'
  + '<div id="homePanorama"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.save = () => {}; window.toast = (m) => { window.__lastToast = m; };
window.needsFund = () => false; window.loadFund = () => {}; window.refreshQuotes = () => {};
window.showMarketFund = () => {}; window.renderQuoteBoard = () => {};
window.paintCanvasMsg = () => {}; window.drawNav = () => {}; window.chartStat = () => {};
window.selectCode = () => {}; window.showView = () => {};

window.INDUSTRY_POOL = [
  { name: '芯片/半导体', code: '512760', etf: '' },
  { name: '光伏', code: '515790', etf: '' },
  { name: '电池', code: '159755', etf: '' },
  { name: '新能源车', code: '515030', etf: '' },
  { name: '白酒/消费', code: '512690', etf: '' },
];
const files = ['js/utils.js', 'js/moneyflow.js', 'js/industry-panorama.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }
const P = window.__pan;

const CLIST_JSON = { rc: 0, data: { total: 2, diff: {
  '0': { f12: 'BK1', f14: '半导体', f62: 1000000.0, f184: 2.0 },
  '1': { f12: 'BK2', f14: '光伏设备', f62: -500000.0, f184: -1.0 },
} } };

// 拦截 JSONP：fflow/daykline 按 lmt 回灌 N 条（带日期），clist 回灌行业板块
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = function (tag) {
  const el = origCreate(tag);
  if (String(tag).toLowerCase() === 'script') {
    setTimeout(() => {
      const s = el.src || '';
      const m = s.match(/[?&](?:cb|callback)=([^&]+)/); const cb = m && m[1];
      if (!cb) { if (el.onerror) el.onerror(); return; }
      if (s.indexOf('fflow/daykline') >= 0) {
        const lm = s.match(/lmt=(\d+)/); const n = lm ? parseInt(lm[1], 10) : 5;
        const kl = [];
        for (let i = n; i >= 1; i--) {
          const day = String(20 - i).padStart(2, '0');
          kl.push('2026-08-' + day + ',' + (i % 3 === 0 ? -1000000 * i : 1000000 * i));
        }
        window[cb]({ data: { klines: kl } });
      } else if (s.indexOf('clist/get') >= 0) {
        window[cb](CLIST_JSON);
      } else { el.onerror && el.onerror(); }
    }, 0);
  }
  return el;
};

let fails = 0; const A = (c, m) => { if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); };
const wait = () => new Promise(r => setTimeout(r, 30));
const pf = () => window.document.getElementById('panFund');
const q = (sel) => pf().querySelector(sel);

window.computeIndustryRows = async () => ({ rows: [
  { name: '芯片/半导体', code: '512760', etf: '', day: 2.3, klMiss: false, _st: { state: 'bull', label: '强上升', tip: 't' }, _kl: [{ close: 10 }] },
  { name: '光伏', code: '515790', etf: '', day: -1.2, klMiss: false, _st: { state: 'down', label: '下跌', tip: '' }, _kl: [{ close: 5 }] },
  { name: '电池', code: '159755', etf: '', day: 0.5, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 8 }] },
  { name: '新能源车', code: '515030', etf: '', day: 1.1, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 6 }] },
  { name: '白酒/消费', code: '512690', etf: '', day: -0.3, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 9 }] },
] });

(async () => {
  const rows = (await window.computeIndustryRows()).rows;
  // 模拟 clist(当日) + push2his(近5日) 已异步注入（正常流程由 loadClistFlow/runFundFlows 完成）
  rows[0]._clistNet = { name: '半导体', net: 1000000, pct: 2.0 };   // 512760
  rows[1]._clistNet = { name: '光伏设备', net: -500000, pct: -1.0 }; // 515790
  rows[0]._flowDays = { err: null, days: [1000000, 2000000, -500000, 800000, 300000], dates: ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'], last: 300000, cont: 1, sum: 3600000 };

  console.log('— 查询条渲染（行业总览模式） —');
  P.renderFundTrend(rows, { err: null });
  let h = pf().innerHTML;
  A(h.indexOf('ff-qbar') >= 0, '资金走向顶部渲染查询条 ff-qbar');
  A(h.indexOf('选择行业ETF') >= 0, '下拉含「选择行业ETF」占位选项');
  A(h.indexOf('512760') >= 0, '下拉含行业池ETF代码(512760)');
  A(h.indexOf('5日') >= 0 && h.indexOf('60日') >= 0, '含 5日/60日 天数按钮');
  A(h.indexOf('data-role="qinp"') >= 0, '含自定义代码输入框');
  A(h.indexOf('行业主力净流入合计（当日）') >= 0, '未查询时默认显示行业总览');

  console.log('— 下拉选ETF + 查询 —');
  const sel = q('[data-role="qsel"]');
  sel.value = '512760';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  q('[data-role="qgo"]').click();
  await wait(); await wait();
  h = pf().innerHTML;
  A(h.indexOf('近5日主力净流入') >= 0, '查询后显示「近5日主力净流入」标题');
  A(h.indexOf('芯片/半导体') >= 0, '结果含ETF名称(芯片/半导体)');
  A(h.indexOf('区间合计') >= 0, '结果含区间合计');
  A(h.indexOf('ff-bars') >= 0, '结果含柱状图容器 ff-bars');
  A(h.indexOf('ff-bar up') >= 0 && h.indexOf('ff-bar dn') >= 0, '柱状图含红涨/绿跌柱');
  A(h.indexOf('ff-row') >= 0, '结果含每日明细列表 ff-row');
  A(h.indexOf('2026-08-15') >= 0, '明细含最近日期(5条mock含08-15)');
  A(pf().querySelectorAll('.ff-row').length === 5, '默认5日 → 明细5行');

  console.log('— 天数切换 10日 —');
  q('.ff-qbtn[data-days="10"]').click();
  await wait(); await wait();
  h = pf().innerHTML;
  A(h.indexOf('近10日主力净流入') >= 0, '切换后显示「近10日主力净流入」');
  A(pf().querySelectorAll('.ff-row').length === 10, '10日 → 明细10行');
  A(q('.ff-qbtn.on') && q('.ff-qbtn.on').getAttribute('data-days') === '10', '10日按钮高亮 .on');

  console.log('— 自定义代码查询 —');
  const inp = q('[data-role="qinp"]');
  inp.value = '159995';
  q('[data-role="qgo"]').click();
  await wait(); await wait();
  h = pf().innerHTML;
  A(h.indexOf('159995') >= 0, '自定义代码查询：显示代码159995');
  A(h.indexOf('主力净流入') >= 0, '自定义代码查询：显示主力净流入结果');

  console.log('— 回行业总览 —');
  q('.ff-qback').click();
  h = pf().innerHTML;
  A(h.indexOf('行业主力净流入合计（当日）') >= 0, '回总览：恢复行业资金流总览');
  A(h.indexOf('近5日主力净流入') >= 0, '回总览：保留近5日增强区');

  console.log('— 空代码提示 —');
  P.renderFundTrend(rows, { err: null });
  const sel2 = q('[data-role="qsel"]'); sel2.value = '';
  const inp2 = q('[data-role="qinp"]'); inp2.value = '';
  q('[data-role="qgo"]').click();
  A(window.__lastToast && window.__lastToast.indexOf('ETF代码') >= 0, '无代码点查询 → toast 提示选择ETF');

  console.log(fails ? ('\n❌ ' + fails + ' 项失败') : '\n✅ 单ETF资金流查询 全部通过');
  process.exit(fails ? 1 : 0);
})();
