/* 新闻多源降级链 + 新闻可点击 + 资金流板块轮动 回归测试（jsdom 实跑，零网络）
 * 场景A：新浪通 → 用「新浪财经」，新闻可点击跳转
 * 场景B：新浪挂 → 自动切「同花顺快讯」
 * 场景C：都挂 → 显示「新闻源暂不可用」
 * 资金流：东财挂时仍显示「板块轮动 · 今日领涨/领跌」
 * 单测：matchNewsToItems 把{title,url}映射成带行业方向的可点击条目
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
          { title: '半导体设备订单大增', digest: '', url: 'https://news.10jqka.com.cn/2026/a1.shtml' },
          { title: '光伏硅料价格反弹', digest: '', url: 'https://news.10jqka.com.cn/2026/a2.shtml' },
          { title: '白酒龙头业绩超预期', digest: '', url: 'https://news.10jqka.com.cn/2026/a3.shtml' },
          { title: '光伏企业净利降幅明显', digest: '', url: 'https://news.10jqka.com.cn/2026/a4.shtml' },
        ] } });
      } else if (s.indexOf('feed.mix.sina.com.cn') >= 0) { // 新浪
        if (mode === 'sinaFail' || mode === 'allfail') { el.onerror && el.onerror(); return; }
        window[cbName]({ result: { data: [
          { title: '创新药迎来政策利好', url: 'https://finance.sina.com.cn/stock/x/2026-b1.shtml' },
          { title: '锂电储能需求旺盛', url: 'https://finance.sina.com.cn/stock/x/2026-b2.shtml' },
          { title: '光伏龙头遭减持抛售', url: 'https://finance.sina.com.cn/stock/x/2026-b3.shtml' },
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
  console.log('— matchNewsToItems 单测 —');
  const items = P.matchNewsToItems([
    { title: '创新药迎来政策利好', url: 'https://x/1' },
    { title: '半导体设备订单大增', url: 'https://x/2' },
    { title: '今日天气晴', url: 'https://x/3' },
  ]);
  A(Array.isArray(items) && items.length >= 2, 'matchNewsToItems 返回命中行业的条目数组');
  A(items.every(it => 'title' in it && 'url' in it && 'dir' in it && 'code' in it), '每条含 title/url/dir/code 字段');
  A(items.some(it => it.url && it.url.indexOf('http') === 0), '命中的条目带可跳转 url');
  A(items.some(it => it.code === '159992' && it.name.indexOf('医药') >= 0), '创新药条目正确归属到医药/医疗行业');

  console.log('— renderNewsDir 按利好/利空/中性分组单测 —');
  P.renderNewsDir([
    { title: 'A创新药政策利好', url: 'https://x/1', dir: 'up', name: '医药' },
    { title: 'B光伏遭减持', url: 'https://x/2', dir: 'down', name: '光伏' },
    { title: 'C天气晴', url: '', dir: 'flat', name: '' },
  ], {}, null, '测试源');
  let nd = window.document.getElementById('panNews').innerHTML;
  A(nd.indexOf('利好（') >= 0 && nd.indexOf('利空（') >= 0 && nd.indexOf('中性（') >= 0, '分组单测：利好/利空/中性三组标题均出现');
  A(nd.indexOf('▼利空') >= 0, '分组单测：利空箭头▼利空存在');
  A(nd.indexOf('target="_blank"') >= 0, '分组单测：有链接则新标签打开');
  A(nd.indexOf('新闻来源：测试源') >= 0, '分组单测：底部标注来源');
  A(nd.indexOf('nd-grp') >= 0, '分组单测：使用分组容器样式');

  console.log('— 同花顺 JSONP 解析（含 url）单测 —');
  await new Promise(res => {
    P.loadThsNews(50, r => {
      A(r && !r.err && r.label === '同花顺快讯', 'loadThsNews 成功返回 label=同花顺快讯');
      A(r && r.items && r.items.length === 4, 'loadThsNews 解析出 4 条带 url 的 items');
      A(r && r.items[0].url && r.items[0].url.indexOf('http') === 0, 'loadThsNews 条目带可跳转 url');
      res();
    });
  });
  await wait();

  console.log('— 场景A：新浪通 → 用新浪财经，新闻可点击跳转 —');
  mode = 'bothok';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait();
  let news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('新浪财经') >= 0, '场景A：底部标注来源=新浪财经');
  A(news.indexOf('创新药') >= 0 || news.indexOf('医药') >= 0, '场景A：命中创新药/医药行业');
  A(news.indexOf('锂电') >= 0 || news.indexOf('新能源车') >= 0, '场景A：命中锂电/新能源车行业');
  A(news.indexOf('▲利好') >= 0, '场景A：含利好箭头');
  A(news.indexOf('利空（') >= 0, '场景A：利空方向分组可见，含「利空（」');
  A(news.indexOf('▼利空') >= 0, '场景A：含利空箭头▼利空');
  A(news.indexOf('href="https://finance.sina.com.cn') >= 0, '场景A：新闻标题带可点击链接(href)');
  A(news.indexOf('target="_blank"') >= 0, '场景A：链接在新标签打开(target=_blank)');
  let fund = window.document.getElementById('panFund').innerHTML;
  A(fund.indexOf('板块轮动') >= 0, '场景A：资金流区含「板块轮动·今日领涨/领跌」(永不空)');

  console.log('— 场景B：新浪挂 → 自动降同花顺 —');
  mode = 'sinaFail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait();
  news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('同花顺快讯') >= 0, '场景B：底部标注来源=同花顺快讯（已降级）');
  A(news.indexOf('半导体') >= 0 || news.indexOf('光伏') >= 0, '场景B：命中半导体/光伏行业');
  A(news.indexOf('新浪财经') < 0, '场景B：不再显示新浪财经');
  A(news.indexOf('利空（') >= 0, '场景B：利空方向分组可见，含「利空（」');
  A(news.indexOf('▼利空') >= 0, '场景B：含利空箭头▼利空');
  A(news.indexOf('href="https://news.10jqka.com.cn') >= 0, '场景B：同花顺新闻同样可点击跳转');

  console.log('— 场景C：都挂 → 诚实降级 —');
  mode = 'allfail';
  P.resetPanorama();
  await window.renderIndustryPanorama(true); await wait(); await wait(); await wait(); await wait();
  news = window.document.getElementById('panNews').innerHTML;
  A(news.indexOf('新闻源暂不可用') >= 0, '场景C：显示「新闻源暂不可用」降级文案');

  console.log(fails ? ('\n❌ ' + fails + ' 项失败') : '\n✅ 新闻多源降级 + 可点击 + 板块轮动 全部通过');
  process.exit(fails ? 1 : 0);
})();
