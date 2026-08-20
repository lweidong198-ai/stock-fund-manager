/* 新闻多源降级链回归测试（jsdom 实跑，零网络）：
 *  场景A：新浪通 → 用「新浪财经」，行业命中
 *  场景B：新浪挂 → 自动切「同花顺快讯」
 *  场景C：都挂 → 显示「新闻源暂不可用」
 *  另含：同花顺 JSONP 解析单测
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
window.INDUSTRY_POOL = [
  { name: '芯片/半导体', code: '512760', etf: '芯片ETF' },
  { name: '新能源车', code: '515030', etf: '新能源车ETF' },
  { name: '医药/医疗', code: '159992', etf: '创新药ETF' },
  { name: '光伏', code: '515790', etf: '光伏ETF' },
];
const files = ['js/utils.js', 'js/moneyflow.js', 'js/industry-panorama.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }
const P = window.__pan;

// 模拟 JSONP：按域名回灌假数据；mode 控制新浪/同花顺成功与否
let mode = 'bothok'; // 'bothok' | 'sinaFail' | 'allfail'
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = function (tag) {
  const el = origCreate(tag);
  if (String(tag).toLowerCase() === 'script') {
    setTimeout(() => {
      const s = el.src || '';
      const m = s.match(/callback=([^&]+)/);
      const cbName = m && m[1];
      if (!cbName) { if (el.onerror) el.onerror(); return; }
      if (s.indexOf('10jqka.com.cn') >= 0) {            // 同花顺
        if (mode === 'allfail') { el.onerror && el.onerror(); return; }
        window[cbName]({ code: '200', data: { list: [
          { title: '半导体设备订单大增', digest: '' },
          { title: '光伏硅料价格反弹', digest: '' },
          { title: '白酒龙头业绩超预期', digest: '' },
        ] } });
      } else if (s.indexOf('feed.mix.sina.com.cn') >= 0) { // 新浪
        if (mode === 'sinaFail' || mode === 'allfail') { el.onerror && el.onerror(); return; }
        window[cbName]({ result: { data: [
          { title: '创新药迎来政策利好' },
          { title: '锂电储能需求旺盛' },
        ] } });
      } else {                                          // 其他域（东财资金流等）→ 直接降级，不污染新闻
        if (el.onerror) el.onerror();
      }
    }, 0);
  }
  return el;
};

let fails = 0; const A = (c, m) => { if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); };
const wait = () => new Promise(r => setTimeout(r, 25));

window.computeIndustryRows = async () => ({ rows: [
  { name: '芯片/半导体', code: '512760', etf: '', day: 2.3, klMiss: false, _st: { state: 'bull', label: '强上升', tip: 't' }, _kl: [{ close: 10 }] },
  { name: '新能源车', code: '515030', etf: '', day: -1.2, klMiss: false, _st: { state: 'down', label: '下跌', tip: '' }, _kl: [{ close: 5 }] },
  { name: '医药/医疗', code: '159992', etf: '', day: 0.5, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 8 }] },
  { name: '光伏', code: '515790', etf: '', day: 1.1, klMiss: false, _st: { state: 'flat', label: '横盘', tip: '' }, _kl: [{ close: 6 }] },
] });

(async () => {
  console.log('— 同花顺 JSONP 解析单测 —');
  await new Promise(res => {
    P.loadThsNews(50, r => {
      A(r && !r.err && r.label === '同花顺快讯', 'loadThsNews 成功返回 label=同花顺快讯');
      A(r && r.titles && r.titles.length === 3, 'loadThsNews 解析出 3 条标题');
      A(r && r.titles.indexOf('半导体设备订单大增') >= 0, 'loadThsNews 标题含「半导体设备订单大增」');
      res();
    });
  });
  await wait();

  console.log('— 场景A：新浪通 → 用新浪财经 —');
  mode = 'bothok';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait();
  let news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('新浪财经') >= 0, '场景A：底部标注来源=新浪财经');
  A(news.indexOf('创新药') >= 0 || news.indexOf('医药') >= 0, '场景A：命中创新药/医药行业');
  A(news.indexOf('锂电') >= 0 || news.indexOf('新能源车') >= 0, '场景A：命中锂电/新能源车行业');
  A(news.indexOf('▲利好') >= 0, '场景A：含利好箭头');

  console.log('— 场景B：新浪挂 → 自动降同花顺 —');
  mode = 'sinaFail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait();
  news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('同花顺快讯') >= 0, '场景B：底部标注来源=同花顺快讯（已降级）');
  A(news.indexOf('半导体') >= 0 || news.indexOf('光伏') >= 0, '场景B：命中半导体/光伏行业');
  A(news.indexOf('新浪财经') < 0, '场景B：不再显示新浪财经');

  console.log('— 场景C：都挂 → 诚实降级 —');
  mode = 'allfail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait();
  news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('新闻源暂不可用') >= 0, '场景C：显示「新闻源暂不可用」降级文案');

  console.log(fails ? ('\n❌ ' + fails + ' 项失败') : '\n✅ 新闻多源降级链全部通过');
  process.exit(fails ? 1 : 0);
})();
