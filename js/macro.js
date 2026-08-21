/* =========================================================================
 * macro.js — 二期 宏观温度（间接指标版）
 * ⚠ 免费前端拿不到官方宏观数据（CPI/M2/PMI/官方利率）——东财被拦、新浪无跨域、
 *   统计局无 JSONP。本页用「行情类间接指标」代替，每项明确标注间接、仅供参考：
 *   利率方向=十年国债ETF / 避险情绪=黄金 / 景气代理=沪深300+行业轮动宽度 / 海外风险偏好=纳指
 * 全部数据走腾讯行情+K线（必通）。不构成投资建议。
 * ========================================================================= */
var MACRO_ITEMS = [
  { code:'sh511260', key:'rate', name:'利率方向', via:'十年国债ETF', logic:'债价涨 → 市场预期利率下行（债牛）；债价跌 → 担心利率上行', how:'债涨时成长/长久期资产相对受益；债跌时警惕利率压力' },
  { code:'sh518880', key:'gold', name:'避险情绪', via:'黄金ETF', logic:'金价涨 → 避险情绪浓', how:'金涨+股市跌=资金在躲风险；金涨+股市也涨=流动性宽松' },
  { code:'sh000300', key:'eco', name:'景气代理', via:'沪深300（近60日）+ 行业轮动宽度', logic:'大盘涨 → 市场对经济预期偏乐观', how:'仅作代理，不能替代官方 GDP/PMI；宽度=今天多少行业在涨' },
  { code:'sh513100', key:'risk', name:'海外风险偏好', via:'纳指ETF', logic:'纳指涨 → 全球风险偏好回升', how:'海外情绪外溢的参考' }
];
function macroDir(v){
  if(v == null) return { tag:'数据不足', cls:'flat', icon:'⚪' };
  if(v >= 2) return { tag:'明显偏多', cls:'up', icon:'🟢' };
  if(v > 0) return { tag:'偏多', cls:'up', icon:'🟢' };
  if(v <= -2) return { tag:'明显偏空', cls:'down', icon:'🔴' };
  return { tag:'偏空', cls:'down', icon:'🔴' };
}
function macroCardHtml(it, q, c20, extra){
  const dir = macroDir(c20);
  return '<div class="mc-card"><div class="mc-h">' + dir.icon + ' <b>' + it.name + '</b> <span class="am-tag">' + it.via + '</span>'
    + '<span class="mc-dir ' + dir.cls + '">' + dir.tag + '</span></div>'
    + '<div class="mc-now">今日 ' + (q && q.changePct != null ? '<span class="' + (q.changePct>=0?'cls-up':'cls-dn') + '">' + (q.changePct>=0?'+':'') + q.changePct.toFixed(2) + '%</span>' : '—')
    + '　近20日 ' + (c20 != null ? '<span class="' + (c20>=0?'cls-up':'cls-dn') + '">' + (c20>=0?'+':'') + c20.toFixed(2) + '%</span>' : '—') + '</div>'
    + (extra ? '<div class="mc-extra">' + extra + '</div>' : '')
    + '<div class="mc-logic">📖 ' + it.logic + '</div>'
    + '<div class="mc-how">怎么用：' + it.how + '</div></div>';
}
async function renderMacro(){
  const el = $('macroBody'); if(!el) return;
  el.innerHTML = '<div class="sig-load">宏观间接指标加载中…</div>';
  const codes = MACRO_ITEMS.map(x => x.code);
  const quotes = {};
  try{
    const r = await fetch('https://qt.gtimg.cn/q=' + codes.join(',') + '&_=' + Date.now());
    const buf = await r.arrayBuffer();
    const d = (typeof parseTencent==='function') ? parseTencent(new TextDecoder('gb18030').decode(buf)) : {};
    Object.assign(quotes, d);
  }catch(e){}
  /* 行业轮动宽度：行业池今日上涨家数占比（景气代理补充） */
  let width = null;
  try{
    if(typeof INDUSTRY_POOL !== 'undefined'){
      const codes2 = INDUSTRY_POOL.map(x => normCode(x.code));
      const r = await fetch('https://qt.gtimg.cn/q=' + codes2.join(',') + '&_=' + Date.now());
      const buf2 = await r.arrayBuffer();
      const d = (typeof parseTencent==='function') ? parseTencent(new TextDecoder('gb18030').decode(buf2)) : {};
      const ups = codes2.filter(c => d[c] && d[c].changePct != null && d[c].changePct > 0).length;
      const total = codes2.filter(c => d[c] && d[c].changePct != null).length;
      width = total ? (ups + '/' + total) : null;
    }
  }catch(e){}
  let h = '';
  for(const it of MACRO_ITEMS){
    const q = quotes[it.code];
    let c20 = null;
    if(typeof loadKlineP==='function' && typeof klinePct==='function'){
      try{ const kl = await loadKlineP(it.code, 'd'); if(kl && kl.length) c20 = klinePct(kl, 20); }catch(e){}
    }
    let extra = null;
    if(it.key === 'eco' && width) extra = '行业轮动宽度：今日上涨 <b>' + width + '</b> 家（涨多=市场情绪偏暖）';
    h += macroCardHtml(it, q, c20, extra);
  }
  el.innerHTML = '<div class="mc-warn">⚠ <b>本页为「间接指标」</b>：免费前端拿不到官方 CPI/M2/PMI/官方利率（数据源受限），用行情类指标代替观察<b>方向</b>，不是官方统计、不构成投资建议。</div>'
    + '<div class="mc-grid">' + h + '</div>';
}
