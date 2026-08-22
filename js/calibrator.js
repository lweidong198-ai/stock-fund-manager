/* =========================================================================
 * calibrator.js
 * 模块来源小节：数据校准（后台静默守护）：K线/行情质量自检，异常时仅角标提醒
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 数据校准（后台静默守护）：K线/行情质量自检，异常时仅角标提醒 ============ */
// 交易日工具：判定日期是否周末（A股/ETF 周末绝对休市；腾讯 fqkline 偶发脏数据会吐周末bar，属明显错误）
function isWeekend(ds){
  if(!ds) return false;
  const t = new Date(String(ds).slice(0,10)+'T00:00:00');
  if(isNaN(t.getTime())) return false;
  const d = t.getDay();
  return d===0 || d===6;
}
// K线净化：剔除周末 bar + 过滤非法 OHLC（防御性——避免数据源脏数据进图）；返回新数组，不改原数据
function sanitizeKline(kl){
  if(!Array.isArray(kl)) return kl;
  const out = [];
  for(const b of kl){
    if(isWeekend(b.date || b.day)) continue;
    const o=+b.open, h=+b.high, l=+b.low, c=+b.close;
    // 价格必须为正且有限；腾讯前复权对极早期数据偶尔算出负价（如周线 low=-150），会拉爆价格区间把图压成一条线，必须剔除
    if(!(o>0) || !(h>0) || !(l>0) || !(c>0)) continue;
    if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)) continue;
    if(h < l) continue;            // OHLC 关系非法（高<低）
    out.push(b);
  }
  return out;
}

const DataCalibrator = (function(){
  let report = { kline:{}, quote:[], fetch:[] };
  let titleBase = '';
  function el(id){ return document.getElementById(id); }
  // 最近交易日（跳过周末，向前找）
  function lastTradeDayStr(d){
    const x=new Date(d);
    for(let i=0;i<8;i++){ const day=x.getDay(); if(day!==0&&day!==6) return x.toISOString().slice(0,10); x.setDate(x.getDate()-1); }
    return new Date(d).toISOString().slice(0,10);
  }
  // —— 单只K线质量校验，返回异常原因数组（空=正常）——
  function checkKline(code, kl){
    const R=[];
    if(!kl || !Array.isArray(kl) || !kl.length){ R.push('K线为空（接口未返回，或代码未归一化导致腾讯返回空）'); return R; }
    const n=kl.length;
    if(n<20) R.push('K线条数过少（'+n+'根），仅拉到当日增量或接口异常');
    const last=kl[kl.length-1];
    const lastDay=String(last.date||last.day||'').slice(0,10);
    const recent=lastTradeDayStr(new Date());
    if(lastDay && recent && lastDay < recent) R.push('K线末日陈旧（'+lastDay+'），应≈最近交易日（'+recent+'）——可能停更');
    let lo=Infinity, hi=-Infinity, bad=0, ohlc=0;
    for(const b of kl){
      const o=+b.open,h=+b.high,l=+b.low,c=+b.close;
      if(![o,h,l,c].every(x=>isFinite(x)&&x>0)){ bad++; continue; }
      if(h<l || h<Math.max(o,c) || l>Math.min(o,c)) ohlc++;
      if(o<lo)lo=o; if(h>hi)hi=h;
    }
    if(bad>0) R.push('存在 '+bad+' 根非法价格（NaN/≤0）');
    if(ohlc>0) R.push('存在 '+ohlc+' 根 OHLC 逻辑错乱（high<low 等）');
    if(hi>0 && lo>0){ const span=(hi-lo)/hi; if(span<0.005) R.push('价格区间异常收窄（跨度 '+(span*100).toFixed(2)+'%，疑似被压成一条线）'); }
    // 非交易日（周末）K线 bar —— 腾讯 fqkline 偶发脏数据会吐周末 bar（如行业ETF出现 8/8、8/9 周六日实体），属明显错误
    let wknd=0, wkSample='';
    for(const b of kl){
      const ds=String(b.date||b.day||'').slice(0,10);
      if(ds && isWeekend(ds)){ wknd++; if(!wkSample) wkSample=ds; }
    }
    if(wknd>0) R.push('K线含 '+wknd+' 根非交易日(周末)数据（如 '+wkSample+'）——数据源脏数据，前端已自动过滤');
    return R;
  }
  // —— 实时行情质量校验 ——
  function checkQuotes(dict){
    const R=[];
    if(!dict) return R;
    for(const code in dict){
      const q=dict[code]; if(!q) continue;
      const price=+q.price, pct=+q.changePct, yc=+q.prevClose;
      if(!isFinite(price)||price<=0) R.push('['+code+'] 价格非法（price='+q.price+'）——字段类型/解析异常');
      if(isFinite(pct) && Math.abs(pct)>25) R.push('['+code+'] 涨跌幅异常（'+pct+'%）');
      if(yc>0 && isFinite(price) && price>0){
        const calc=((price-yc)/yc*100);
        if(isFinite(calc) && Math.abs(calc-pct)>2 && Math.abs(pct)<=25) R.push('['+code+'] 涨跌幅与（现价-昨收）不符（标 '+pct+'% / 算 '+calc.toFixed(2)+'%）');
      }
      if(yc>0){ // A股/ETF 应有五档盘口
        const ask=q.ask, bid=q.bid;
        const bad5 = !Array.isArray(ask)||ask.length<5||!Array.isArray(bid)||bid.length<5 || (ask&&ask.some(a=>!(a&&isFinite(+a[0])))) || (bid&&bid.some(b=>!(b&&isFinite(+b[0]))));
        if(bad5) R.push('['+code+'] 五档盘口缺失/异常');
      }
    }
    return R;
  }
  // —— UI ——
  function ensureUI(){
    if(el('dcBadge')) return;
    titleBase = document.title || '行情工具';
    const badge=document.createElement('div');
    badge.id='dcBadge'; badge.innerHTML='⚠<span id="dcCount">0</span>';
    badge.onclick=()=>{ const p=el('dcPanel'); if(p) p.style.display=(p.style.display==='block'?'none':'block'); };
    document.body.appendChild(badge);
    const panel=document.createElement('div');
    panel.id='dcPanel'; panel.style.display='none';
    panel.innerHTML='<div id="dcHead">⚠ 数据校准告警 <span id="dcClose" onclick="DataCalibrator.hide()">×</span></div><div id="dcBody"></div>';
    document.body.appendChild(panel);
  }
  function render(){
    ensureUI();
    const kc=Object.keys(report.kline).length;
    const total=kc+report.quote.length+report.fetch.length;
    const b=el('dcBadge'), p=el('dcPanel');
    if(total===0){
      if(b) b.style.display='none';
      if(p) p.style.display='none';
      if(document.title.indexOf('⚠ ')===0) document.title=titleBase;
      return;
    }
    if(b){ b.style.display='block'; el('dcCount').textContent=total; }
    if(document.title.indexOf('⚠ ')!==0) document.title='⚠ '+document.title;
    let html='';
    for(const code in report.kline) html+='<div class="dcItem"><b>'+code+'</b> · K线：'+report.kline[code].join('；')+'</div>';
    if(report.quote.length) html+='<div class="dcItem">行情：'+report.quote.slice(0,10).join('；')+'</div>';
    if(report.fetch.length) html+='<div class="dcItem">接口：'+report.fetch.join('；')+'</div>';
    if(el('dcBody')) el('dcBody').innerHTML=html;
  }
  function reportKline(code, reasons){ if(reasons&&reasons.length) report.kline[code]=reasons; else delete report.kline[code]; render(); }
  function reportQuotes(reasons){ report.quote=(reasons||[]).slice(0,10); render(); }
  function reportFetch(msg){ if(msg && report.fetch.indexOf(msg)<0) report.fetch.push(msg); render(); }
  function clearFetch(msg){ if(msg){ const i=report.fetch.indexOf(msg); if(i>=0) report.fetch.splice(i,1); } else report.fetch=[]; render(); }
  function hide(){ const p=el('dcPanel'); if(p) p.style.display='none'; }
  function toggle(f){ const p=el('dcPanel'); if(p) p.style.display=(f? 'block':'none'); }
  function clearAll(){ report={kline:{},quote:[],fetch:[]}; render(); }
  return { checkKline, checkQuotes, reportKline, reportQuotes, reportFetch, clearFetch, hide, clearAll, _report:()=>report };
})();
window.DataCalibrator = DataCalibrator;

