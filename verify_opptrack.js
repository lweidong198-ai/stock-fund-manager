/* 「我的机会」回归测试（jsdom 实跑，零网络）
 * 覆盖：addMyOpp/delMyOpp/hasMyOpp 增删查 / toggleMyOpp / renderMyOpps 渲染（行情+四灯+🎯机会窗口）/ 空态
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><div id="myOppBody"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.__toast = []; window.toast = (m) => window.__toast.push(m); window.goView = () => {};
window.nameOf = (c) => ({ 'sh515050': '5G通信ETF', '012863': '电池ETF联接C' }[c] || c);
window.todayStr = () => '2026-08-21';
window.kindOf = () => null;
window.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode('v_sh515050="1"' + ';'.repeat(60))) });
window.parseTencent = (txt) => ({ 'sh515050': { name: '5G通信ETF', price: 1.23, changePct: 1.5 } });
window.loadKlineP = async (code) => [{ date: '2026-08-01', close: 100 }, { date: '2026-08-20', close: 107 }];
window.klinePct = (kl, n) => 7.0;
window.isFundKind = (c) => String(c).replace(/^(sh|sz)/, '') === '012863';
window.signalLights = async (code) => {
  if (String(code).replace(/^(sh|sz)/, '') === '515050') {
    return { val: { state: 'green', detail: '便宜区间' }, fund: { state: 'gray', detail: 'x' }, tech: { state: 'green', text: '站上20日线', detail: 'y' }, trend: { state: 'green', text: '跑赢+5.0pp', detail: 'z' } };
  }
  return { val: { state: 'red', detail: '偏贵' }, fund: { state: 'gray', detail: 'x' }, tech: { state: 'gray', detail: 'y' }, trend: { state: 'gray', detail: 'z' } };
};

const files = ['js/utils.js', 'js/opptrack.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— 增删查 —');
  window.localStorage.clear();
  window.addMyOpp('sh515050');
  window.addMyOpp('012863');
  A(window.loadMyOpps().length === 2, '加入2个跟踪标的');
  A(window.hasMyOpp('515050') && window.hasMyOpp('012863'), '按裸码查重命中');
  window.__toast = [];
  window.addMyOpp('sh515050');
  A(window.loadMyOpps().length === 2 && window.__toast.some(t => t.indexOf('已在') >= 0), '重复添加被拦截');
  window.delMyOpp('515050');
  A(window.loadMyOpps().length === 1 && !window.hasMyOpp('515050'), '移除生效');
  window.toggleMyOpp('515050');
  A(window.hasMyOpp('515050'), 'toggle 重新加入');

  console.log('— 渲染（行情+四灯+机会窗口） —');
  await window.renderMyOpps();
  await wait(60);
  let body = window.document.getElementById('myOppBody').innerHTML;
  A(body.indexOf('mopp-row') >= 0, '渲染跟踪行');
  A(body.indexOf('5G通信ETF') >= 0 && body.indexOf('1.23') >= 0, '名称+现价显示');
  A(body.indexOf('+1.50%') >= 0, '今日涨跌显示');
  A(body.indexOf('近20日 +7.0%') >= 0, '近20日涨幅显示');
  A(body.indexOf('估值🟢') >= 0 && body.indexOf('技术🟢') >= 0, '四灯图标渲染');
  A(body.indexOf('🎯 机会窗口') >= 0, '估值绿+技术绿 → 机会窗口徽标');
  A(body.indexOf('便宜区间') >= 0 && body.indexOf('跑赢+5.0pp') >= 0, '灯详情文案');
  A(body.indexOf('移除') >= 0, '每行有移除按钮');

  console.log('— 空态 —');
  window.localStorage.clear();
  await window.renderMyOpps();
  body = window.document.getElementById('myOppBody').innerHTML;
  A(body.indexOf('还没有跟踪标的') >= 0, '空态引导（去行情看板加机会）');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 我的机会 全部通过');
  process.exit(fails ? 1 : 0);
})();
