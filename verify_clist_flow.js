/* 资金走向·多源资金流回归测试（jsdom 实跑，零网络）
 * 主源：东财 clist 行业板块主力净流入（当日，一次请求全行业，JSONP）
 * 增强：东财 push2his 个股近5日（best-effort）
 * 兜底：板块轮动（本地今日涨跌，永远有）
 * 单测：matchClistToPool 映射 / loadClistFlow 解析 / renderFundTrend 分组 / 多源降级
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body>'
  + '<div id="panGlobal"></div><div id="panHeat"></div><div id="panFund"></div><div id="panOpps"></div><div id="panNews"></div>'
  + '<div id="homePanorama"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.save = () => {}; window.toast = () => {};
window.needsFund = () => false; window.loadFund = () => {}; window.refreshQuotes = () => {};
window.showMarketFund = () => {}; window.renderQuoteBoard = () => {};
window.paintCanvasMsg = () => {}; window.drawNav = () => {}; window.chartStat = () => {};
window.selectCode = () => {}; window.showView = () => {};

// 测试专用行业池（不 eval sectors.js，避免 INDUSTRY_POOL const 冲突）
window.INDUSTRY_POOL = [
  { name: '芯片/半导体', code: '512760', etf: '' },
  { name: '光伏', code: '515790', etf: '' },
  { name: '电池', code: '159755', etf: '' },
  { name: '新能源车', code: '515030', etf: '' },
  { name: '白酒/消费', code: '512690', etf: '' },
  { name: '有色金属', code: '512400', etf: '' },
];
const files = ['js/utils.js', 'js/moneyflow.js', 'js/industry-panorama.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }
const P = window.__pan;

const CLIST_JSON = { rc: 0, data: { total: 4, diff: {
  '0': { f12: 'BK1', f14: '半导体', f62: 119492192.0, f184: 5.2 },
  '1': { f12: 'BK2', f14: '光伏设备', f62: -88234122.0, f184: -3.1 },
  '2': { f12: 'BK3', f14: '电池', f62: 55123000.0, f184: 2.0 },
  '3': { f12: 'BK4', f14: '有色金属', f62: -12340000.0, f184: -1.1 },
} } };
const FIVE_KLINES = { data: { klines: [
  '2026-08-20,1000000', '2026-08-19,2000000', '2026-08-18,-500000', '2026-08-17,800000', '2026-08-14,300000',
] } };

// 拦截 JSONP：mode 控制 clist / push2his 是否成功
let mode = 'allok'; // 'allok' | 'clistfail' | 'allfail'
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = function (tag) {
  const el = origCreate(tag);
  if (String(tag).toLowerCase() === 'script') {
    setTimeout(() => {
      const s = el.src || '';
      const m = s.match(/[?&](?:cb|callback)=([^&]+)/); const cb = m && m[1];
      if (!cb) { if (el.onerror) el.onerror(); return; }
      if (s.indexOf('fflow/daykline') >= 0) {                 // push2his 近5日
        if (mode === 'allfail') { el.onerror && el.onerror(); return; }
        window[cb](FIVE_KLINES);
      } else if (s.indexOf('clist/get') >= 0) { // clist 行业板块（jsdom 会规范化 +，故只匹配路径）
        if (mode === 'clistfail' || mode === 'allfail') { el.onerror && el.onerror(); return; }
        window[cb](CLIST_JSON);
      } else { el.onerror && el.onerror(); }
    }, 0);
  }
  return el;
};

let fails = 0; const A = (c, m) => { if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); };
const wait = () => new Promise(r => setTimeout(r, 25));

window.computeIndustryRows = async () => ({ rows: [
  { name: '芯片/半导体', code: '512760', etf: '', day: 2.3, klMiss: false, _st: { state: 'bull', label: '强上升', tip: 't' }, _kl: [{ close: 10 }] },
  { name: '光伏', code: '515790', etf: '', day: -1.2, klMiss: false, _st: { state: 'down', label: '下跌', tip: '' }, _kl: [{ close: 5 }] },
  { name: '电池', code: '159755', etf: '', day: 0.5, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 8 }] },
  { name: '新能源车', code: '515030', etf: '', day: 1.1, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 6 }] },
  { name: '白酒/消费', code: '512690', etf: '', day: -0.3, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 9 }] },
  { name: '有色金属', code: '512400', etf: '', day: 0.2, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 7 }] },
] });

(async () => {
  console.log('— matchClistToPool 映射单测 —');
  A(P.matchClistToPool('半导体', window.INDUSTRY_POOL) === '512760', '半导体→芯片/半导体(512760)');
  A(P.matchClistToPool('光伏设备', window.INDUSTRY_POOL) === '515790', '光伏设备→光伏(515790)');
  A(P.matchClistToPool('电池', window.INDUSTRY_POOL) === '159755', '电池→电池(159755)');
  A(P.matchClistToPool('有色金属', window.INDUSTRY_POOL) === '512400', '有色金属→有色金属(512400)');
  A(P.matchClistToPool('人工智能', window.INDUSTRY_POOL) === null, '不相关板块→null');

  console.log('— loadClistFlow 解析单测 —');
  await new Promise(res => {
    P.loadClistFlow(r => {
      A(r && !r.err, 'loadClistFlow 解析成功(err=null)');
      A(r && r.map['512760'] && r.map['512760'].net === 119492192, '半导体 主力净流入 119492192 正确映射');
      A(r && r.map['515790'] && r.map['515790'].net === -88234122, '光伏设备 净流出 -88234122 正确映射');
      A(r && r.map['159755'] && r.map['159755'].net === 55123000, '电池 净流入 55123000 正确映射');
      A(r && r.map['512400'] && r.map['512400'].pct === -1.1, '有色金属 净占比 -1.1 解析');
      res();
    });
  });
  await wait();

  console.log('— renderFundTrend 直接渲染（clist 主源）单测 —');
  const rows = (await window.computeIndustryRows()).rows;
  rows.forEach(r => { if (P.matchClistToPool && (r.code === '512760' || r.code === '515790' || r.code === '159755' || r.code === '512400')) {
    const map = { '512760': { name: '半导体', net: 119492192, pct: 5.2 }, '515790': { name: '光伏设备', net: -88234122, pct: -3.1 }, '159755': { name: '电池', net: 55123000, pct: 2.0 }, '512400': { name: '有色金属', net: -12340000, pct: -1.1 } };
    r._clistNet = map[r.code];
  } });
  P.renderFundTrend(rows, { err: null });
  let f = window.document.getElementById('panFund').innerHTML;
  A(f.indexOf('行业主力净流入合计（当日）') >= 0, '渲染：含「行业主力净流入合计（当日）」');
  A(f.indexOf('今日主力净流入 Top6') >= 0, '渲染：含「今日主力净流入 Top6」');
  A(f.indexOf('今日主力净流出 Top6') >= 0, '渲染：含「今日主力净流出 Top6」');
  A(f.indexOf('板块轮动') >= 0, '渲染：永远含「板块轮动·今日领涨/领跌」');
  A(f.indexOf('东方财富·行业板块主力净流入(当日)') >= 0, '渲染：标注来源=东方财富·行业板块主力净流入(当日)');

  console.log('— 场景A：clist+近5日 双源均通 —');
  mode = 'allok';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait(); await wait();
  f = window.document.getElementById('panFund').innerHTML;
  A(f.indexOf('今日主力净流入 Top6') >= 0, '场景A：今日主力净流入(行业板块主源)已显示');
  A(f.indexOf('近5日主力净流入合计') >= 0, '场景A：近5日主力净流入合计(增强)已显示');
  A(f.indexOf('板块轮动') >= 0, '场景A：板块轮动永远显示');

  console.log('— 场景B：clist 挂，仅近5日可用 —');
  mode = 'clistfail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait(); await wait();
  f = window.document.getElementById('panFund').innerHTML;
  A(f.indexOf('暂连不上') >= 0 || f.indexOf('近5日主力净流入合计') >= 0, '场景B：clist 挂→降级显示近5日/提示');
  A(f.indexOf('板块轮动') >= 0, '场景B：板块轮动仍显示');

  console.log('— 场景C：clist+近5日 全挂，仅板块轮动 —');
  mode = 'allfail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait(); await wait();
  f = window.document.getElementById('panFund').innerHTML;
  A(f.indexOf('板块轮动') >= 0, '场景C：仅板块轮动兜底显示');
  A(f.indexOf('今日涨跌轮动') >= 0, '场景C：来源标注降级为「今日涨跌轮动」');

  console.log(fails ? ('\n❌ ' + fails + ' 项失败') : '\n✅ 资金流多源(clist主源+近5日+板块轮动) 全部通过');
  process.exit(fails ? 1 : 0);
})();
