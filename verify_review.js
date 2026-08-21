/* 每日复盘回归测试（jsdom 实跑，零网络）
 * 覆盖：reviewCollect 收集 / genTodayReview 存档与幂等 / renderReview 今日卡+历史 /
 *      pruneReviews 30天滚动 / tryAutoReview 盘中不生成+收盘自动生成
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><div id="reviewBody"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {};
window.kindOf = () => null; // utils.js isFundKind 依赖
window.__trading = false;
window.isTradingNow = () => window.__trading;
window.priceOf = (code) => ({ '012863': 0.72, 'sh515790': 1.02, '600519': 1500 }[code] || 0);
window.nameOf = (code) => ({ '012863': '电池ETF联接C', 'sh515790': '光伏ETF', '600519': '贵州茅台' }[code] || code);
window.state = {
  hold: [
    { code: '012863', shares: 27342, cost: 0.8533 },
    { code: '600519', shares: 100, cost: 1400 }
  ],
  quotes: { 'sh515790': { changePct: 2.5 }, 'sh512760': { changePct: -1.2 }, 'sh512690': { changePct: 0.3 }, '600519': { changePct: 1.1 } },
  fundData: { '012863': { latest: 0.72, prev: 0.715 } }
};
window.indexQuotes = {
  'sh000001': { changePct: 0.55 }, 'sz399001': { changePct: 1.1 }, 'sz399006': { changePct: 1.8 }, 'sh000300': { changePct: 0.9 }
};
window.INDUSTRY_POOL = [
  { name: '光伏', code: '515790', etf: '' }, { name: '芯片/半导体', code: '512760', etf: '' }, { name: '白酒/消费', code: '512690', etf: '' }
];

const files = ['js/utils.js', 'js/review.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const today = window.todayStr();

(async () => {
  console.log('— reviewCollect 收集 —');
  const c = window.reviewCollect();
  A(c.date === today, '复盘日期=今天');
  A(c.bench['上证'] === 0.55 && c.bench['沪深300'] === 0.9, '大盘四指数涨跌幅收集');
  A(Math.abs(c.hold.mv - (27342 * 0.72 + 100 * 1500)) < 0.01, '持仓总市值（电池19686 + 茅台150000）');
  A(Math.abs(c.hold.pl - (27342 * (0.72 - 0.8533) + 100 * (1500 - 1400))) < 0.01, '总浮动盈亏 = -3644 + 10000 = 6356');
  A(c.hold.count === 2, '持仓笔数');
  A(c.leaders.length === 3 && c.leaders[0].name === '光伏', '领涨排序（光伏+2.5% 第一）');
  A(c.laggers.length === 3 && c.laggers[0].name === '芯片/半导体', '领跌排序（半导体-1.2% 第一）');

  console.log('— genTodayReview 存档与幂等 —');
  const r1 = window.genTodayReview(true);
  const saved = window.loadReviews();
  A(!!saved[today], '已存 localStorage（key=今天）');
  A(saved[today].bench && saved[today].hold && saved[today].leaders, '存档含大盘/持仓/板块');
  const r2 = window.genTodayReview(false);
  A(r1.date === r2.date && r1.at === r2.at, '非 force 不重新生成（幂等）');
  const r3 = window.genTodayReview(true);
  A(r3.hold.mv === r1.hold.mv, 'force 重新生成');

  console.log('— renderReview 今日卡+历史 —');
  const all = window.loadReviews();
  all['2026-08-19'] = { date: '2026-08-19', at: '15:02', bench: { '上证': -0.5 }, hold: { mv: 100000, pl: -2000, plp: -1.96, day: -300, count: 2 }, holdRows: [], leaders: [], laggers: [], indAvg: 0.1 };
  all['2026-08-18'] = { date: '2026-08-18', at: '15:03', bench: {}, hold: { mv: 99000, pl: 1000, plp: 1.02, day: 500, count: 2 }, holdRows: [], leaders: [], laggers: [], indAvg: null };
  window.saveReviews(all);
  window.renderReview();
  const body = window.document.getElementById('reviewBody').innerHTML;
  A(body.indexOf('review-card') >= 0 && body.indexOf(today) >= 0, '渲染今日复盘卡');
  A(body.indexOf('上证') >= 0 && body.indexOf('沪深300') >= 0, '复盘卡含大盘');
  A(body.indexOf('总市值') >= 0 && body.indexOf('浮动盈亏') >= 0, '复盘卡含持仓盈亏');
  A(body.indexOf('领涨') >= 0 && body.indexOf('光伏') >= 0, '复盘卡含板块领涨');
  A(body.indexOf('2026-08-19') >= 0 && body.indexOf('2026-08-18') >= 0, '历史列表含两天');
  A(body.indexOf('<details') >= 0, '历史用 details 折叠');
  A(body.indexOf('不构成投资建议') >= 0, '复盘卡诚实标注');

  console.log('— pruneReviews 30天滚动 —');
  const big = {}; for (let i = 0; i < 40; i++) big['2026-0' + String(i).padStart(2, '0')] = { date: 'x' };
  window.pruneReviews(big);
  A(Object.keys(big).length === 30, '超过30天 → 裁剪到30');

  console.log('— tryAutoReview：盘中不生成 / 收盘自动 —');
  window.localStorage.removeItem('qr_review_v1');
  window.__trading = true;
  window.tryAutoReview();
  A(!window.loadReviews()[today], '盘中：不自动生成');
  window.__trading = false;
  window.tryAutoReview();
  A(!!window.loadReviews()[today], '非交易时段：自动生成今日摘要');
  const cntBefore = Object.keys(window.loadReviews()).length;
  window.tryAutoReview();
  A(Object.keys(window.loadReviews()).length === cntBefore, '已有今日摘要：不重复生成');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 每日复盘 全部通过');
  process.exit(fails ? 1 : 0);
})();
