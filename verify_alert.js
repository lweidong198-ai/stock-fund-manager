/* 止盈止损提醒回归测试（jsdom 实跑，零网络）
 * 覆盖：到止盈/破止损合并闪烁+一次响铃 / 每天只提醒一次 / 声音开关 / 未到点不触发
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><button id="btnAlertSound"></button></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {};
window.beeps = 0;
window.AudioContext = function(){
  return { createOscillator(){ return { connect(){}, disconnect(){}, set type(v){}, set frequency(v){}, start(){}, stop(){} }; }, createGain(){ return { connect(){}, set gain(v){}, gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; }, get currentTime(){ return 0; }, get destination(){ return {}; } };
};
window.priceOf = (code) => ({ '012863': 0.72, 'sh515790': 1.05, '600519': 1500 }[code] || 0);
window.nameOf = (code) => ({ '012863': '电池ETF联接C', 'sh515790': '光伏ETF', '600519': '贵州茅台' }[code] || code);
window.todayStr = () => '2026-08-21';
window.state = {
  hold: [
    { code: '012863', shares: 27342, cost: 0.8533, target: 0.70, stop: 0.604 },   // 现价0.72 ≥ 0.70 → 到止盈
    { code: '600519', shares: 100, cost: 1400, stop: 1500 }                        // 现价1500 ≤ 1500 → 破止损
  ]
};

const files = ['js/utils.js', 'js/alert.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }

const origBeep = window.beep; window.beep = function(){ if(window.alertSoundOn()) window.beeps++; };
const flashEl = () => window.document.getElementById('alertFlash');

console.log('— 到点触发（合并提醒） —');
window.localStorage.clear();
window.checkHoldAlerts();
const flash = flashEl();
A(!!flash && flash.className === 'show', '闪烁条出现（show）');
A(flash.textContent.indexOf('电池ETF联接C') >= 0 && flash.textContent.indexOf('到止盈价') >= 0, '止盈提醒文案（电池到止盈0.70）');
A(flash.textContent.indexOf('贵州茅台') >= 0 && flash.textContent.indexOf('破止损价') >= 0, '止损提醒文案（茅台破止损1500）——两条合并显示');
A(window.beeps === 1, '合并提醒只响一次提示音');
const saved = JSON.parse(window.localStorage.getItem('qr_alerts_v1') || '{}');
A(!!saved['2026-08-21'] && !!saved['2026-08-21']['012863_t'] && !!saved['2026-08-21']['600519_s'], '已记录当天提醒（每持仓一个 key）');

console.log('— 每天只提醒一次 —');
window.checkHoldAlerts();
A(window.beeps === 1, '同天重复检查不再响铃');

console.log('— 声音开关 —');
A(window.alertSoundOn() === true, '默认声音开');
window.toggleAlertSound();
A(window.alertSoundOn() === false, '开关切换为关');
A(window.document.getElementById('btnAlertSound').textContent === '提醒声：关', '顶栏按钮文案同步为关');
window.beeps = 0;
window.localStorage.removeItem('qr_alerts_v1');   // 只清提醒记录，不动声音设置
window.checkHoldAlerts();
A(window.beeps === 0, '声音关闭时不响铃（仅视觉闪烁）');
window.toggleAlertSound();
A(window.alertSoundOn() === true, '再切换恢复开');

console.log('— 未到点不触发 —');
window.localStorage.removeItem('qr_alerts_v1'); window.beeps = 0;
window.priceOf = (code) => ({ '012863': 0.65, 'sh515790': 1.05, '600519': 1600 }[code] || 0); // 0.604<0.65<0.70 未到点；1600>1500
const oldFlash = flashEl(); if(oldFlash) oldFlash.className = '';
window.checkHoldAlerts();
A(window.beeps === 0, '未到止盈/未破止损 → 不提醒');
A(flashEl() ? flashEl().className === '' : true, '闪烁条隐藏（无新提醒）');

console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 止盈止损提醒 全部通过');
process.exit(fails ? 1 : 0);
