/* =========================================================================
 * alert.js — 二期 页面内提醒 + 声音闪烁
 * 持仓止盈/止损到点提醒：现价 ≥ 止盈价 或 ≤ 止损价 → 顶部红色闪烁 + 提示音（可关）。
 * 每只持仓每天只提醒一次（localStorage 记当天已提醒），避免整日循环响铃。
 * 纯纪律辅助，不构成投资建议。
 * ========================================================================= */
var ALERT_KEY = 'qr_alerts_v1';
var ALERT_SOUND_KEY = 'qr_alert_sound';
function alertSoundOn(){ try{ return localStorage.getItem(ALERT_SOUND_KEY) !== '0'; }catch(e){ return true; } }
function setAlertSound(on){ try{ localStorage.setItem(ALERT_SOUND_KEY, on ? '1' : '0'); }catch(e){} }
/* 提示音：WebAudio 双短音；无 AudioContext（部分旧浏览器/隐私模式）→ 静默，仅视觉 */
function beep(){
  if(!alertSoundOn()) return;
  try{
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    const ctx = new AC();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      o.start(t0); o.stop(t0 + 0.24);
    });
  }catch(e){}
}
/* 顶部红色闪烁条（6秒自动消失） */
function alertFlash(msg){
  let b = document.getElementById('alertFlash');
  if(!b){ b = document.createElement('div'); b.id = 'alertFlash'; document.body.appendChild(b); }
  b.textContent = msg; b.className = 'show';
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.className = ''; }, 6000);
}
/* 检查持仓止盈止损（行情刷新时调用；每持仓每天提醒一次） */
function checkHoldAlerts(){
  if(typeof state === 'undefined' || !state || !state.hold || !state.hold.length) return;
  const today = (typeof todayStr === 'function') ? todayStr() : '';
  let done = {}; try{ done = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}') || {}; }catch(e){}
  const dayDone = done[today] || {};
  let changed = false; const msgs = [];
  state.hold.forEach(h => {
    const p = (typeof priceOf === 'function') ? priceOf(h.code) : 0;
    if(!(p > 0)) return;
    const nm = (typeof nameOf === 'function') ? nameOf(h.code) : h.code;
    if(h.target > 0 && p >= h.target && !dayDone[h.code + '_t']){
      dayDone[h.code + '_t'] = 1; changed = true;
      msgs.push(' ' + nm + ' 已到止盈价 ' + fmt(h.target, 2) + '（现价 ' + fmt(p) + '）——按计划考虑止盈');
    } else if(h.stop > 0 && p <= h.stop && !dayDone[h.code + '_s']){
      dayDone[h.code + '_s'] = 1; changed = true;
      msgs.push(' ' + nm + ' 已破止损价 ' + fmt(h.stop, 2) + '（现价 ' + fmt(p) + '）——按纪律考虑止损');
    }
  });
  if(msgs.length){ beep(); alertFlash(msgs.join('　')); }
  if(changed){ done[today] = dayDone; try{ localStorage.setItem(ALERT_KEY, JSON.stringify(done)); }catch(e){} }
}
/* 顶栏声音开关 */
function toggleAlertSound(){
  const on = !alertSoundOn(); setAlertSound(on);
  const b = document.getElementById('btnAlertSound'); if(b) b.textContent = '提醒声：' + (on ? '开' : '关');
  return on;
}
function initAlertUi(){
  const b = document.getElementById('btnAlertSound');
  if(b) b.textContent = '提醒声：' + (alertSoundOn() ? '开' : '关');
}
if(document.readyState === 'complete') initAlertUi();
else window.addEventListener('load', initAlertUi);
