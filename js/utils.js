/* =========================================================================
 * utils.js
 * 模块来源小节：工具
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 工具 ============ */
function $(id){ return document.getElementById(id); }
function fmt(n,d=2){ if(n==null||isNaN(n)) return '--'; return Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function pct(n){ if(n==null||isNaN(n)) return '--'; return (n>=0?'+':'')+n.toFixed(2)+'%'; }
function fmtVol(v){ if(v==null) return '--'; if(v>=1e8) return (v/1e8).toFixed(2)+'亿'; if(v>=1e4) return (v/1e4).toFixed(0)+'万'; return v.toFixed(0); }
function cls(n){ return n>0?'up':(n<0?'down':'flat'); }
function ts(){ const d=new Date(); const p=x=>String(x).padStart(2,'0'); return p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
/* 数据连接状态：ok / err / load，点击 err 可重试 */
function setDataStatus(type, msg, retry){
  const el=$('dataStatus'); if(!el) return;
  el.className='pill ds '+type;
  el.textContent=(type==='ok'?'数据：正常':type==='load'?'数据：加载中…':type==='demo'?'数据：演示·离线（点重试）':('数据：'+msg));
  el.onclick = (type==='err' && retry) ? retry : (type==='demo' ? retryAll : null);
}
/* 图表常驻状态条：不依赖 F12/弹窗，直接在页面上显示绘制状态或错误 */
function chartStat(msg, kind){
  const el=$('chartStat'); if(!el) return;
  el.className='chartstat'+(kind==='err'?' err':kind==='ok'?' ok':'');
  el.textContent=msg;
}
/* 把错误直接画到画布上，保证即使崩溃也"看得见"而不是纯空白 */
function paintCanvasError(cvId, err){
  const cv=$(cvId); if(!cv) return;
  const ctx=cv.getContext('2d');
  const w=cv.clientWidth||300, h=cv.clientHeight||parseInt(cv.getAttribute('height'))||300;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#d22'; ctx.font='13px sans-serif'; ctx.textAlign='left';
  const text='图表绘制出错：'+(err&&err.message?err.message:err)+'\n（已记录，请截图反馈）';
  const lines=text.split('\n');
  lines.forEach((t,i)=>ctx.fillText(t,12,24+i*20));
}
// 在画布上居中显示一段多行说明文字（用于"数据源不可达"等友好提示，不假装数据）
function paintCanvasMsg(cvId, msg, color){
  const cv=$(cvId); if(!cv) return;
  const ctx=cv.getContext('2d');
  const w=cv.clientWidth||300, h=cv.clientHeight||parseInt(cv.getAttribute('height'))||300;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle=color||'#999'; ctx.font='13px sans-serif'; ctx.textAlign='center';
  const lines=(''+msg).split('\n');
  const lh=20, total=lines.length*lh;
  lines.forEach((t,i)=>ctx.fillText(t, w/2, h/2 - total/2 + i*lh + lh));
}
function sinaSymbol(code){
  if(/^sh|^sz|^hk/i.test(code)) return code.toLowerCase();
  if(/^us/i.test(code)) return 'gb_'+code.slice(2).toLowerCase();
  if(/^\d{6}$/.test(code)){ const sh=(code[0]==='6'||code[0]==='5'); return (sh?'sh':'sz')+code; } // 裸6位代码补前缀：5/6开头=沪市(sh)，其余=深市(sz)；行业扫描池用裸码，须在此补齐
  return code;
}
function normCode(raw){
  raw = String(raw == null ? '' : raw).trim();
  if(!raw) return null;
  if(/^(sh|sz|hk|us)/i.test(raw)) return raw.toLowerCase();
  if(/^\d{6}$/.test(raw)){ const sh=(raw[0]==='6'||raw[0]==='5'); return (sh?'sh':'sz')+raw; }
  if(/^\d{5}$/.test(raw)) return 'sz'+raw;
  return raw.toLowerCase();
}
// 是否为“疑似基金代码”：6位纯数字且非场内ETF/LOF特征码(159/50/51/52/56/58/59开头) → 按基金加载净值
function isLikelyFundCode(raw){ const c=String(raw||'').replace(/^(sz|sh|hk|us)/i,''); if(!/^\d{6}$/.test(c)) return false; return !/^(50|51|52|56|58|59|15)\d{4}$/.test(c); }
// 分类判断：存储的 kind 优先（股票就是股票、基金就是基金）；仅在 kind 缺失时回退代码启发式
// 这样 600519(贵州茅台) 等正规股票不会被误判成基金、错用演示基金净值
function isFundKind(code){ const k=kindOf(code); if(k==='fund') return true; if(k==='stock') return false; return isLikelyFundCode(code); }
// 收集需要加载基金净值的代码(含 kind=fund 与疑似基金码，统一规整为东方财富裸码)
function fundCodesToLoad(){ const set=new Set(); [...(state.watch||[]),...(state.hold||[])].forEach(x=>{ if(x&&x.code&&isFundKind(x.code)) set.add(String(x.code).replace(/^(sz|sh|hk|us)/i,'')); }); return [...set]; }
/* 本地（用户时区）“今天”日期字符串，避免 UTC 偏移导致凌晨/跨时区判断错一天 */
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
/* K线最新一根 bar 的日期（数组必须已按日期升序） */
function klineLastDate(kl){ return (kl && kl.length) ? kl[kl.length-1].date : null; }
/* 标记K线缓存：_date = 最新 bar 日期（而非“今天”），_loadedAt = 当前时间。
   这样当 tailOnly 没拿到今日 bar 时，_date 仍停留在旧日，下次刷新会继续补刷，避免“假刷新”后永远卡住。 */
function markKlineDate(kl){ if(kl && kl.length){ kl._date=klineLastDate(kl); kl._loadedAt=Date.now(); } }

/* 用 K 线收盘价自动校准实时行情价格的单位（元 vs 分）。
   腾讯 qt.gtimg.cn 对 ETF/LOF 的价格字段单位不统一：有些返回“分”（如 sh515050 返回 105.26），
   有些返回“元”（如 sz159608 返回 0.55）。不能按代码前缀硬除，必须以 K 线（fqkline，单位元）为基准。
   逻辑：取 K 线缓存最近 5 根收盘价均值 kAvg，计算 ratio=quote.price/kAvg。
   - ratio > 30：行情价被放大约 100 倍，按 ÷100 校准。
   - ratio < 0.03：行情价被缩小约 100 倍，按 ×100 校准（罕见）。
   - 否则不动。对 quote 的 price/open/high/low/prevClose/limitUp/limitDown 及 bid/ask 价格统一缩放。
   幂等：校准后 ratio 会回到 1 附近，重复调用不会二次缩放。 */
function calibrateQuoteToKline(code, quote){
  if(!quote || !quote.price) return quote;
  const key=(code+'d');
  const kl=state.kcache[key] || state.kcache[normCode(code)+'d'];
  if(!kl || !kl.length || kl._demo) return quote;
  const tail=kl.slice(-5).filter(x=>x && x.close>0);
  if(!tail.length) return quote;
  const kAvg=tail.reduce((s,x)=>s+x.close,0)/tail.length;
  if(!(kAvg>0)) return quote;
  const ratio=quote.price/kAvg;
  if(ratio>30) return scaleQuotePrices(quote, 0.01);
  if(ratio<0.03) return scaleQuotePrices(quote, 100);
  return quote;
}
function scaleQuotePrices(quote, factor){
  if(!quote || !(factor>0)) return quote;
  const fields=['price','open','high','low','prevClose','limitUp','limitDown','change'];
  fields.forEach(f=>{ if(typeof quote[f]==='number' && !isNaN(quote[f])) quote[f]*=factor; });
  ['ask','bid'].forEach(side=>{
    if(Array.isArray(quote[side])) quote[side]=quote[side].map(lvl=>[typeof lvl[0]==='number'?lvl[0]*factor:lvl[0], typeof lvl[1]==='number'?lvl[1]:lvl[1]]);
  });
  // 振幅%、涨跌幅%、换手率、成交量、成交额 是比率/绝对量，不缩放
  return quote;
}

