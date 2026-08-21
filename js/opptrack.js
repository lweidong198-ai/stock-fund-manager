/* =========================================================================
 * opptrack.js — 二期「我的机会」跟踪 + 条件提醒
 * 把看中的 ETF/股票/基金加入跟踪（localStorage），持续显示：
 *   现价/今日涨跌/近20日走势 + 四灯状态（估值/资金/技术/趋势）
 * 条件提醒：估值灯绿 且 技术灯绿 → 标「🎯 机会窗口」黄条提醒。
 * 纯描述，不构成投资建议。
 * ========================================================================= */
var MOPP_KEY = 'qr_myopp_v1';
function loadMyOpps(){ try{ return JSON.parse(localStorage.getItem(MOPP_KEY) || '[]') || []; }catch(e){ return []; } }
function saveMyOpps(o){ try{ localStorage.setItem(MOPP_KEY, JSON.stringify(o)); }catch(e){} }
function hasMyOpp(code){
  const bare = String(code).replace(/^(sh|sz)/, '');
  return loadMyOpps().some(x => String(x.code).replace(/^(sh|sz)/, '') === bare);
}
function addMyOpp(code){
  if(!code) return;
  const c = (typeof normCode === 'function') ? normCode(String(code).trim()) : String(code).trim();
  const bare = String(c).replace(/^(sh|sz)/, '');
  if(hasMyOpp(bare)){ if(typeof toast==='function') toast('已在「我的机会」里了'); return; }
  const list = loadMyOpps();
  list.push({ code: c, name: (typeof nameOf==='function') ? nameOf(c) : c, addedAt: (typeof todayStr==='function') ? todayStr() : '' });
  saveMyOpps(list);
  if(typeof toast==='function') toast('✓ 已加入「我的机会」');
}
function delMyOpp(bare){
  saveMyOpps(loadMyOpps().filter(x => String(x.code).replace(/^(sh|sz)/, '') !== bare));
  renderMyOpps();
}
function toggleMyOpp(code){
  const bare = String(code).replace(/^(sh|sz)/, '');
  if(hasMyOpp(bare)){ saveMyOpps(loadMyOpps().filter(x => String(x.code).replace(/^(sh|sz)/, '') !== bare)); if(typeof toast==='function') toast('已移出「我的机会」'); renderMyOpps(); }
  else addMyOpp(code);
}
/* 渲染跟踪列表 */
var _moppRenderSeq = 0;
async function renderMyOpps(){
  const seq = ++_moppRenderSeq;               // 竞态守卫：旧渲染结果不得覆盖新渲染
  const el = $('myOppBody'); if(!el) return;
  const list = loadMyOpps();
  if(!list.length){ el.innerHTML = '<div class="empty-state"><div class="es-icon">⭐</div><div class="es-title">还没有跟踪标的</div><div class="es-desc">去「行情看板」选中标的，点右上「⭐ 加机会」加入；或在本页输入代码添加。</div><div class="es-actions"><input id="myOppCode" class="add-input" placeholder="输入代码，如 515050 / 159755" style="width:200px;" /><button class="ghost" onclick="addMyOpp($(\'myOppCode\').value.trim())">加机会</button></div></div>';
    return;
  }
  el.innerHTML = '<div class="sig-load">跟踪数据加载中…</div>';
  // 批量行情（腾讯，必通）
  const codes = list.map(x => (typeof normCode==='function') ? normCode(x.code) : x.code);
  const quotes = {};
  try{
    const r = await fetch('https://qt.gtimg.cn/q=' + codes.join(',') + '&_=' + Date.now());
    const buf = await r.arrayBuffer();
    const d = (typeof parseTencent==='function') ? parseTencent(new TextDecoder('gb18030').decode(buf)) : {};
    Object.assign(quotes, d);
  }catch(e){}
  let h = '<div class="mopp-list">';
  for(const x of list){
    const code = (typeof normCode==='function') ? normCode(x.code) : x.code;
    const q = quotes[code];
    let lights = null;
    if(typeof signalLights==='function'){
      try{ lights = await signalLights(x.code); }catch(e){}
    }
    let c20 = null;
    if(typeof loadKlineP==='function' && typeof klinePct==='function'){
      try{ const kl = await loadKlineP(x.code, 'd'); if(kl && kl.length) c20 = klinePct(kl, 20); }catch(e){}
    }
    const li = lights || {};
    const iconOf = (s) => s==='green'?'🟢':(s==='red'?'🔴':(s==='mid'?'🟡':'⚪'));
    const windowOpen = li.val && li.val.state==='green' && li.tech && li.tech.state==='green';
    h += '<div class="mopp-row' + (windowOpen ? ' win' : '') + '">'
      + '<div class="mopp-main"><div class="mopp-nm"><b>' + escapeHtml(x.name || x.code) + '</b> <span class="hh-code">' + x.code + '</span>'
      + (windowOpen ? '<span class="mopp-badge">🎯 机会窗口</span>' : '') + '</div>'
      + '<div class="mopp-p">现价 ' + (q ? fmt(q.price) : '—') + '　今日 ' + (q && q.changePct!=null ? '<span class="' + (q.changePct>=0?'cls-up':'cls-dn') + '">' + (q.changePct>=0?'+':'') + q.changePct.toFixed(2) + '%</span>' : '—')
      + '　近20日 ' + (c20!=null ? (c20>=0?'+':'') + c20.toFixed(1) + '%' : '—') + '</div>'
      + '<div class="mopp-lights">估值' + iconOf(li.val&&li.val.state) + ' 资金' + iconOf(li.fund&&li.fund.state) + ' 技术' + iconOf(li.tech&&li.tech.state) + ' 趋势' + iconOf(li.trend&&li.trend.state)
      + ' <span class="mopp-d">' + (li.val ? li.val.detail : '') + (li.trend && li.trend.state!=='gray' ? ' · ' + li.trend.text : '') + '</span></div>'
      + '</div>'
      + '<button class="ghost mopp-del" onclick="delMyOpp(\'' + String(x.code).replace(/^(sh|sz)/, '') + '\')">移除</button>'
      + '</div>';
  }
  h += '</div><div class="mopp-add"><input id="myOppCode" class="add-input" placeholder="输入代码添加，如 515050" style="width:180px;" /><button class="ghost" onclick="addMyOpp($(\'myOppCode\').value.trim())">加机会</button></div>';
  if(seq !== _moppRenderSeq) return;   // 已有更新的渲染 → 丢弃本次结果
  el.innerHTML = h;
}
