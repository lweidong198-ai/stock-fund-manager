/* 宏观温度（间接指标）回归测试（jsdom 实跑，零网络）
 * 覆盖：macroDir 方向判定 / 四卡渲染 / 景气宽度 / 间接指标警示标注 / 数据不足
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><div id="macroBody"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {};
window.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode('x')) });
window.parseTencent = (txt) => ({
  'sh511260': { name: '十年国债ETF', price: 130.5, changePct: 0.2 },
  'sh518880': { name: '黄金ETF', price: 5.5, changePct: 1.1 },
  'sh000300': { name: '沪深300', price: 4000, changePct: 0.5 },
  'sh513100': { name: '纳指ETF', price: 1.8, changePct: -0.8 },
  'sh515790': { name: '光伏ETF', price: 1, changePct: 1.2 },
  'sh512760': { name: '芯片ETF', price: 1, changePct: -0.5 }
});
window.loadKlineP = async (code) => {
  const map = { sh511260: 3.5, sh518880: 6.0, sh000300: 1.2, sh513100: -2.5 };
  if (map[code] == null) return null;
  const kl = [];
  for (let i = 0; i < 22; i++) kl.push({ date: 'd' + i, close: 100 });
  kl[21] = { date: 'd21', close: 100 * (1 + map[code] / 100) };
  return kl;
};
window.klinePct = (kl, n) => { if (!kl || kl.length < n + 1) return null; return (kl[kl.length - 1].close - kl[kl.length - 2].close) / kl[kl.length - 2].close * 100; };
window.kindOf = () => null;
window.INDUSTRY_POOL = [{ code: '515790' }, { code: '512760' }];

const files = ['js/utils.js', 'js/macro.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— macroDir 方向判定 —');
  A(window.macroDir(3.5).tag === '明显偏多' && window.macroDir(3.5).icon === '🟢', '≥2% → 明显偏多');
  A(window.macroDir(0.8).tag === '偏多', '0~2% → 偏多');
  A(window.macroDir(-2.5).tag === '明显偏空' && window.macroDir(-2.5).icon === '🔴', '≤-2% → 明显偏空');
  A(window.macroDir(null).tag === '数据不足', 'null → 数据不足');

  console.log('— 四卡渲染 + 景气宽度 —');
  await window.renderMacro();
  await wait(60);
  const body = window.document.getElementById('macroBody').innerHTML;
  A(body.indexOf('mc-warn') >= 0 && body.indexOf('间接指标') >= 0 && body.indexOf('不是官方统计') >= 0, '顶部显著标注「间接指标非官方」');
  A(body.indexOf('利率方向') >= 0 && body.indexOf('避险情绪') >= 0 && body.indexOf('景气代理') >= 0 && body.indexOf('海外风险偏好') >= 0, '四张卡齐全');
  A(body.indexOf('明显偏多') >= 0 && body.indexOf('明显偏空') >= 0, '方向标签（利率偏多/纳指偏空）');
  A(body.indexOf('行业轮动宽度') >= 0 && body.indexOf('1/2') >= 0, '景气代理含行业宽度（光伏涨/芯片跌=1/2）');
  A(body.indexOf('近20日') >= 0 && body.indexOf('今日') >= 0, '含今日+近20日涨跌');
  A(body.indexOf('怎么用') >= 0 && body.indexOf('不构成投资建议') >= 0, '每卡含用法+免责');

  console.log('— K线不足 → 数据不足 —');
  window.loadKlineP = async (code) => null;
  await window.renderMacro();
  await wait(60);
  const body2 = window.document.getElementById('macroBody').innerHTML;
  A(body2.indexOf('数据不足') >= 0, 'K线拿不到 → 方向标「数据不足」（不瞎编）');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 宏观温度（间接指标） 全部通过');
  process.exit(fails ? 1 : 0);
})();
