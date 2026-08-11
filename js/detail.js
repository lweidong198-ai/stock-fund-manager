/* =========================================================================
 * detail.js
 * 模块来源小节：详情（股票） / 基金工作区 / 自选列表 / 交互 / 添加/清洗时自动识别 股票 or 基金
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 详情（股票） ============ */
function renderDetailHead(){
  const code=state.selected; const w=state.watch.find(x=>x.code===code); if(!w) return;
  const q=state.quotes[code];
  $('dName').textContent=q?q.name:code;
  $('dPrice').textContent=q?fmt(q.price):'--';
  const cEl=$('dChg'); if(q){ cEl.textContent=pct(q.changePct)+' ('+fmt(q.change)+')'; cEl.className=cls(q.change); } else {cEl.textContent='--';cEl.className='flat';}
  $('dMeta').textContent=(q&&q.limited)?'美股 · 实时(有限)':'股票/ETF · 实时';
  $('dTime').textContent=q&&q.time? ('时间 '+q.time.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,'$1-$2-$3 $4:$5:$6')) : '';
  const sub=$('dSub');
  if(sub){
    if(q&&q.limited) sub.innerHTML='美股实时行情有限：仅提供现价与涨跌%';
    else if(q) sub.innerHTML='今开 <b>'+fmt(q.open)+'</b>　昨收 <b>'+fmt(q.prevClose)+'</b>　最高 <b>'+fmt(q.high)+'</b>　最低 <b>'+fmt(q.low)+'</b>';
    else sub.innerHTML='';
  }
  renderQuoteBoard();
}
function renderDetail(){
  const code=state.selected;
  if(!code){ $('detailEmpty').style.display='block'; $('detail').style.display='none'; if($('quoteCard')) $('quoteCard').style.display='none'; return; }
  const w=state.watch.find(x=>x.code===code);
  if(!w || w.kind==='fund'){ $('detailEmpty').style.display='block'; $('detail').style.display='none'; if($('quoteCard')) $('quoteCard').style.display='none'; return; } // 基金由基金工作区处理
  $('detailEmpty').style.display='none'; $('detail').style.display='block'; if($('quoteCard')) $('quoteCard').style.display='block';
  renderDetailHead();
  ['wrapMACD','wrapKDJ','wrapRSI'].forEach(id=>$(id).style.display='block');
  $('klineMain').style.display='block';
  const key=code+state.period; const kl=state.kcache[key];
  // 立即绘制（不依赖 requestAnimationFrame，避免某些浏览器/环境下回调不触发导致空白）
  const drawNow=(data)=>{ try{ const _d=new Date(); const today=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0'); data._date=today; data._loadedAt=Date.now(); state.kcache[key]=data; chartStat('图表：K线已加载，绘制中…', null); drawAll(data); }catch(e){ chartStat('图表绘制出错：'+(e&&e.message?e.message:e), 'err'); } };
  if(kl && kl.length){
    if(kl._demo) $('dHint').innerHTML='当前为演示K线（行情接口暂未返回真实数据）<a href="#" onclick="refreshKline();return false;">重试</a>';
    else $('dHint').innerHTML='指标由K线即时计算 · 红涨绿跌（A股习惯） · 可拖拽/滚轮缩放';
    drawNow(kl);
    // 缓存停在旧日→后台补刷到今天（不阻塞首屏绘制），用户切到该标的也能立刻看到最新一日
    if(kl._date !== (()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()) refreshOneKline(code, state.period, kl);
    return;
  }
  $('dHint').innerHTML='K线加载中… <span style="color:var(--sub)">（腾讯前复权，约1-3秒）</span>';
  chartStat('图表：正在拉取K线数据（'+APP_VER+'）', null);
  loadKline(code, state.period, (data, isDemo)=>{
    if(!data||!data.length){ $('dHint').innerHTML='K线获取失败（该代码可能无数据或接口限流） <a href="#" onclick="refreshKline();return false;">点我重试</a>'; chartStat('图表：K线获取失败（无数据/接口限流）', 'err'); return; }
    if(isDemo){
      data._demo = true;
      $('dHint').innerHTML='当前为演示K线（行情接口暂未返回真实数据）<a href="#" onclick="refreshKline();return false;">重试</a>';
    } else {
      $('dHint').innerHTML='指标由K线即时计算 · 红涨绿跌（A股习惯） · 可拖拽/滚轮缩放 <span style="color:var(--sub)">（更早历史加载中…）</span>';
    }
    drawNow(data);
    if(state.view==='analysis') renderAnalysis();
  }, {
    // 后台补拉到的更早历史：合并进缓存并重绘，视口保持在最新一段不跳动
    onHistory:(full)=>{
      if(state.selected!==code || !full || !full.length) return;
      const main=$('klineMain'); const oldN = (main&&main._kl)?main._kl.length:0;
      state.kcache[key]=full;
      { const _d=new Date(); full._date=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0'); full._loadedAt=Date.now(); }
      // 视口右端锚定最新K线：新增的历史都在左侧，start 相应右移，用户看到的画面不变
      if(main && main._vp){ const grew = full.length-oldN; if(grew>0) main._vp.start += grew; main._vp.n = full.length; }
      try{ drawAll(full); }catch(e){ console.error('onHistory redraw', e); }
      $('dHint').innerHTML='指标由K线即时计算 · 红涨绿跌（A股习惯） · 可拖拽/滚轮缩放 <span style="color:var(--sub)">（已加载 '+full.length+' 根，最早 '+full[0].date+'）</span>';
      if(state.view==='analysis') renderAnalysis();
    }
  });
}
function refreshKline(){
  const code=state.selected; if(!code) return;
  const key=code+state.period;
  delete state.kcache[key];
  renderDetail();
}
function drawAll(kl){
  try{
    if(!kl || !kl.length){ chartStat('图表：无K线数据', null); paintCanvasError('klineMain','无K线数据'); return; }
    drawMain(kl);
    syncVP($('klineMain'),['paneMACD','paneKDJ','paneRSI'],kl.length);
    const closes=kl.map(x=>x.close), highs=kl.map(x=>x.high), lows=kl.map(x=>x.low);
    const m=macd(closes, state.macdParam), k=kdj(highs,lows,closes), r=rsi(closes,6), r2=rsi(closes,12), r3=rsi(closes,24);
    // 主图光标索引 → 传给各副图，画出贯穿整组图表的同一条竖线
    const _cx = $('klineMain')._hover;
    if(state.ind.macd) drawLinePane('paneMACD',[{data:m.dif,color:'#d99a00'},{data:m.dea,color:'#2b7de9'},{data:m.bar,type:'bar'}],
      {guides:[],crossIdx:_cx,legend:[{label:'DIF',color:'#d99a00'},{label:'DEA',color:'#2b7de9'},{label:'柱',color:'#64748b',si:2}]});
    if(state.ind.kdj) drawLinePane('paneKDJ',[{data:k.k,color:'#d99a00'},{data:k.d,color:'#2b7de9'},{data:k.j,color:'#d651a8'}],
      {guides:[80,20],crossIdx:_cx,legend:[{label:'K',color:'#d99a00'},{label:'D',color:'#2b7de9'},{label:'J',color:'#d651a8'}]});
    if(state.ind.rsi) drawLinePane('paneRSI',[{data:r,color:'#d99a00'},{data:r2,color:'#2b7de9'},{data:r3,color:'#d651a8'}],
      {guides:[70,30],crossIdx:_cx,legend:[{label:'RSI6',color:'#d99a00'},{label:'RSI12',color:'#2b7de9'},{label:'RSI24',color:'#d651a8'}]});
    $('dHint').textContent='指标由K线即时计算 · 红涨绿跌（A股习惯） · 可拖拽/滚轮缩放';
    bindKlineInteractions();
    chartStat('图表：已绘制 '+kl.length+' 根K线（版本 '+APP_VER+'）', 'ok');
  }catch(err){
    // 任何未捕获错误：直接画到画布 + 写状态条，绝不让用户面对纯空白
    console.error('[drawAll 崩溃]', err);
    chartStat('图表绘制出错：'+(err&&err.message?err.message:err)+'\n（请截图反馈，版本 '+APP_VER+'）', 'err');
    paintCanvasError('klineMain', err);
  }
}
/* 由鼠标横坐标反解出K线全局索引（与 drawMain/drawLinePane 的 X() 公式一致，含 padL/padR） */
function idxFromX(cv, clientX, n){
  const vp=cv._vp; if(!vp||!n) return null;
  const rect=cv.getBoundingClientRect();
  const cssW=rect.width||cv.clientWidth||0; if(!cssW) return null;
  const cw=cssW-CHART_PADR;
  const per=cw/vp.count; if(!(per>0)) return null;
  let i=vp.start+Math.floor((clientX-rect.left-CHART_PADL)/per);
  return Math.max(0,Math.min(n-1,i));
}
function bindKlineInteractions(){
  const main=$('klineMain'); if(main._pzBound) return;
  bindPanZoom(main,()=>main._kl?main._kl.length:0,()=>{ if(main._kl) drawAll(main._kl); });
  main.addEventListener('mousemove',e=>{
    if(main._dragging){ main._hover=null; return; }
    const n=main._kl?main._kl.length:0; if(!n) return;
    const i=idxFromX(main,e.clientX,n); if(i==null) return;
    if(main._hover!==i){ main._hover=i; drawAll(main._kl); }
  });
  main.addEventListener('mouseleave',()=>{ if(main._hover!=null){ main._hover=null; if(main._kl) drawAll(main._kl); } });
  // 副图反向联动：光标在 MACD/KDJ/RSI 上移动时，主图与其余副图同步画同一条竖线
  ['paneMACD','paneKDJ','paneRSI'].forEach(pid=>{
    const p=$(pid); if(!p||p._xhBound) return; p._xhBound=1;
    p.addEventListener('mousemove',e=>{
      const n=main._kl?main._kl.length:0; if(!n) return;
      const i=idxFromX(p,e.clientX,n); if(i==null) return;
      if(main._hover!==i){ main._hover=i; drawAll(main._kl); }
    });
    p.addEventListener('mouseleave',()=>{ if(main._hover!=null){ main._hover=null; if(main._kl) drawAll(main._kl); } });
  });
}


/* ============ 基金工作区 ============ */
function renderFund(){
  if(!$('fundList')) return;   // 原「基金净值工作区」已转型为「机会精选」，此处仅作安全兜底
  const funds=state.watch.filter(w=>w.kind==='fund');
  const list=$('fundList'), empty=$('fundEmpty'), det=$('fundDetail');
  if(!funds.length){ list.innerHTML=''; empty.style.display='block'; det.style.display='none'; return; }
  empty.style.display='none';
  let html='<table><thead><tr><th>名称</th><th>单位净值</th><th>日涨跌</th><th>操作</th></tr></thead><tbody>';
  funds.forEach(f=>{ const fd=state.fundData[f.code]; const nav=fd?fmt(fd.latest,4):'--'; let cp=null; if(fd&&fd.prev)cp=(fd.latest-fd.prev)/fd.prev*100;
    html+='<tr data-fcode="'+f.code+'"><td><div class="name-cell"><span class="nm">'+(fd?fd.name:f.code)+'</span><span class="cd">'+f.code+'</span></div></td>'
      +'<td>'+nav+'</td><td class="'+(cp==null?'flat':cls(cp))+'">'+(cp==null?'--':pct(cp))+'</td>'
      +'<td><button class="ghost" data-fsel="'+f.code+'" style="padding:2px 7px;font-size:11px;">看</button></td></tr>';
  });
  html+='</tbody></table>'; list.innerHTML=html;
  list.querySelectorAll('tr[data-fcode]').forEach(tr=>tr.onclick=()=>selectCode(tr.dataset.fcode));
  const code = (state.selected && (state.watch.find(x=>x.code===state.selected)||{}).kind==='fund') ? state.selected : funds[0].code;
  showFundDetail(code);
}
function showFundDetail(code){
  const fd=state.fundData[code]; const det=$('fundDetail');
  if(!fd){ det.style.display='block'; $('fName').textContent=code; $('fPrice').textContent='--'; $('fChg').textContent='--'; $('fundHint').textContent='净值加载中…（若长时间无数据，该源可能需要本地服务器环境）'; return; }
  det.style.display='block';
  $('fName').textContent=fd.name||code;
  $('fPrice').textContent=fmt(fd.latest,4);
  const chg=fd.latest-fd.prev, cp=fd.prev?chg/fd.prev*100:0; const cEl=$('fChg'); cEl.textContent=pct(cp)+' ('+fmt(chg,4)+')'; cEl.className=cls(cp);
  $('fMeta').textContent='场外基金 · 单位净值';
  $('fTime').textContent=fd.nav.length? '截至 '+new Date(fd.nav[fd.nav.length-1].t).toLocaleDateString('zh-CN'):'';
  drawNav('fundCanvas', fd);
  $('fundHint').textContent='累计净值：'+fmt(fd.cum.length?fd.cum[fd.cum.length-1].nav:0,4)+' · 共 '+fd.nav.length+' 条净值记录';
}
/* 行情看板内直接展示基金净值（点基金行不跳到基金工作区，原地画净值曲线） */
function showMarketFund(code){
  const w=state.watch.find(x=>x.code===code);
  if(!w || w.kind!=='fund'){ hideMarketFund(); if(state.view==='market') renderDetail(); return; }
  const mfd=$('marketFundDetail'); if(!mfd) return; mfd.style.display='block';
  $('detailEmpty').style.display='none';
  $('detail').style.display='none';
  // ① 东方财富数据源在当前环境不可达 → 明确提示，绝不假装演示数据误导
  if(state.fundFail && state.fundFail[code]){
    $('mFName').textContent=code; $('mFPrice').textContent='—'; $('mFChg').textContent='—'; $('mFChg').className='flat';
    $('mFMeta').textContent='场外基金 · 单位净值'; $('mFTime').textContent=''; $('mFSub').textContent='';
    $('mFHint').innerHTML='🌐 此标的为<b>场外基金</b>，净值来自东方财富。当前「预览/沙箱」域名被东方财富反爬拦截，所以这里暂无数据（非 app 故障，<b>本机双击 index.html 可看真实净值</b>）。<br>想在行情看板看基金走势？直接看<b>场内 ETF</b>（走腾讯 K 线，沙箱完全可用）：'+
      [['sh510300','沪深300ETF'],['sh515050','5G通信ETF'],['sz159915','创业板ETF'],['sz161725','白酒LOF']]
      .map(([c,n])=>`<span class="etf-jump" onclick="addWatch('${c}')">${n}</span>`).join('');
    $('mFStat').textContent='场外基金净值·当前环境不可达（可看场内ETF走势）';
    paintCanvasMsg('mFundNav','场外基金净值\n当前环境不可访问\n\n点击下方场内ETF\n可直接看K线走势', '#999');
    return;
  }
  const fd=state.fundData[code];
  // ② 已有真实净值数据 → 画净值走势
  if(fd && fd.nav && fd.nav.length && !fd._demo){
    $('mFName').textContent=fd.name||code;
    $('mFPrice').textContent=fmt(fd.latest,4);
    const chg=fd.latest-fd.prev, cp=fd.prev?chg/fd.prev*100:0; const cEl=$('mFChg'); cEl.textContent=pct(cp)+' ('+fmt(chg,4)+')'; cEl.className=cls(cp);
    $('mFMeta').textContent='场外基金 · 单位净值';
    $('mFTime').textContent=fd.nav.length? '截至 '+new Date(fd.nav[fd.nav.length-1].t).toLocaleDateString('zh-CN'):'';
    drawNav('mFundNav', fd);
    $('mFHint').textContent='累计净值：'+fmt(fd.cum.length?fd.cum[fd.cum.length-1].nav:0,4)+' · 共 '+fd.nav.length+' 条净值记录';
    return;
  }
  // ③ 加载中（等待东方财富返回；不可达时由 fundFail 分支接管）
  $('mFName').textContent=code; $('mFPrice').textContent='--'; $('mFChg').textContent='--'; $('mFChg').className='flat';
  $('mFMeta').textContent='场外基金 · 单位净值'; $('mFTime').textContent=''; $('mFSub').textContent='';
  $('mFHint').textContent='净值加载中…（若长时间无数据，该源可能需要本地服务器环境）';
  $('mFStat').textContent='东方财富净值加载中…';
  paintCanvasMsg('mFundNav','净值加载中…', '#999');
}
function hideMarketFund(){ const mfd=$('marketFundDetail'); if(mfd) mfd.style.display='none'; }


/* ============ 自选列表 ============ */
function renderWatch(){
  renderWatchCats();
  const box=$('watchBox');
  if(!state.watch.length){ box.innerHTML='<div class="empty">还没有自选，点「载入示例」或输入代码添加</div>'; return; }
  const wf = state.watchFilter||'all';
  const wc = state.watchCat||'all';
  let list = state.watch.filter(w => wf==='all' || (wf==='stock'&&w.kind!=='fund') || (wf==='fund'&&w.kind==='fund'));
  if(wc!=='all') list = list.filter(w => w.cat===wc);
  if(!list.length){ box.innerHTML='<div class="empty">'+(wc==='all'?'该类型下暂无自选':'该分类下暂无自选')+'</div>'; return; }
  let html='<table class="wl-table"><thead><tr><th>名称 / 代码</th><th>现价</th><th>涨跌%</th><th>分类</th></tr></thead><tbody>';
  list.forEach(w=>{
    const code=w.code; let name=code, price='--', cp=null, isFund=w.kind==='fund';
    if(isFund){ const fd=state.fundData[code]; name=fd?fd.name:(CODE_NAMES[code]||code); if(state.fundFail&&state.fundFail[code]){ price='—'; cp=null; } else { price=fd?fmt(fd.latest,4):'--'; if(fd&&fd.prev)cp=(fd.latest-fd.prev)/fd.prev*100; } }
    else { const q=state.quotes[code]; if(q){name=q.name;price=fmt(q.price);cp=q.changePct;} }
    const cpTxt = cp==null?'--':pct(cp);
    const sel = code===state.selected?' sel':'';
    const ccls = cp==null?'flat':cls(cp);
    const hRec = state.hold.find(x=>(''+x.code).replace(/^(sz|sh|hk)/i,'')===(''+code).replace(/^(sz|sh|hk)/i,''));
    const held = !!(hRec && (hRec.shares>0 || hRec.cost>0));   // 仅真实持仓(填了数量/成本)才标"持有中"; 旧版自动建的空占位行(shares=0)不再误显示
    const catOpts = state.watchCats.map(c=>'<option value="'+c.id+'"'+(w.cat===c.id?' selected':'')+'>'+escapeHtml(c.name)+'</option>').join('');
    html+='<tr class="wl-row'+sel+'" data-code="'+code+'">'
      +'<td class="wl-name">'+escapeHtml(name)+'<span class="wl-code">'+code+'</span><span class="wl-kind">'+(isFund?'基':'股')+'</span>'+(held?'<span class="wl-held">持仓中</span>':'')+'<button class="wl-del" data-del="'+code+'" title="删除">✕</button></td>'
      +'<td class="wl-price">'+price+'</td>'
      +'<td class="wl-chg '+ccls+'">'+cpTxt+'</td>'
      +'<td class="wl-cat-cell"><select class="wl-cat" data-code="'+code+'" title="切换所属分类">'+catOpts+'</select></td>'
      +'</tr>';
  });
  html+='</tbody></table>';
  box.innerHTML=html;
  box.querySelectorAll('tr[data-code]').forEach(tr=>tr.onclick=(e)=>{ if(e.target.dataset.del || e.target.closest('.wl-cat')) return; selectCode(tr.dataset.code); });
  box.querySelectorAll('button[data-del]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); delWatch(b.dataset.del); });
  box.querySelectorAll('select.wl-cat').forEach(s=>s.onchange=()=>{ const w=state.watch.find(x=>x.code===s.dataset.code); if(w){ w.cat=s.value; save(); renderWatch(); } });
}

/* 注：08g 移除“滚轮切标的”功能——需求改为自选列表独立滚动+表头吸顶，滚轮用于正常滚动列表，不再拦截切标的。 */

function renderWatchCats(){
  const bar=$('watchCats'); if(!bar) return;
  const cur = state.watchCat||'all';
  let html='<span class="wc-label">📁 分类</span>';
  html+='<span class="tg'+(cur==='all'?' on':'')+'" data-cat="all">全部</span>';
  state.watchCats.forEach(c=>{
    const cnt = state.watch.filter(w=>w.cat===c.id).length;
    const def = c.id==='def';
    html+='<span class="tg wc-chip'+(cur===c.id?' on':'')+'" data-cat="'+c.id+'" title="双击重命名'+(def?'':' · 点✕删除')+'">'
        + escapeHtml(c.name)+'<span class="wc-cnt">'+cnt+'</span>'
        + (def?'':'<span class="wc-x" data-delcat="'+c.id+'" title="删除分类">✕</span>')
        +'</span>';
  });
  html+='<span class="tg wc-add" data-addcat="1" title="新建分类">＋</span>';
  bar.innerHTML=html;
}
function addWatchCat(){
  const name = prompt('新建分类名称：', '我的分类');
  if(name==null) return;
  const nm = name.trim(); if(!nm) return;
  const id = 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  state.watchCats.push({id, name:nm});
  state.watchCat = id;   // 立即切到新分类，新加的自选自动归入
  save(); renderWatchCats(); renderWatch();
  toast('✓ 已新建分类「'+nm+'」');
}
function renameWatchCat(id){
  const c = state.watchCats.find(x=>x.id===id); if(!c) return;
  const name = prompt('重命名分类：', c.name);
  if(name==null) return;
  const nm = name.trim(); if(!nm) return;
  c.name = nm; save(); renderWatchCats(); renderWatch();
}
function delWatchCat(id){
  const c = state.watchCats.find(x=>x.id===id); if(!c || id==='def') return;
  if(!confirm('删除分类「'+c.name+'」？\n该分类下的自选会移回「默认」分类（不会被删除）。')) return;
  state.watchCats = state.watchCats.filter(x=>x.id!==id);
  state.watch.forEach(w=>{ if(w.cat===id) w.cat='def'; });
  if(state.watchCat===id) state.watchCat='all';
  save(); renderWatchCats(); renderWatch();
}
function renderHoldSelect(){
  const dl=$('watchList'); if(!dl) return; dl.innerHTML='';
  state.watch.forEach(w=>{ const o=document.createElement('option'); o.value=w.code+' '+nameOf(w.code); dl.appendChild(o); });
}
function kindOf(code){ const h=state.hold.find(x=>x.code===code); if(h) return h.kind; const w=state.watch.find(x=>x.code===code); if(w) return w.kind; return null; }
function priceOf(code){ const bare=String(code||'').replace(/^(sz|sh|hk|us)/i,''); if(isFundKind(code)){ const fd=state.fundData[bare]; if(fd&&fd.latest) return fd.latest; } const q=state.quotes[code]||state.quotes[bare]; return q?q.price:0; }
function nameOf(code){
  const k=kindOf(code);
  if(k==='fund'){ const fd=state.fundData[code]; if(fd&&fd.name) return fd.name; }
  const q=state.quotes[code]; if(q&&q.name) return q.name;
  return CODE_NAMES[code]||code;
}

function renderHold(){
  renderHoldSelect();
  const box=$('holdBox'); const sum=$('holdSummary');
  if(!state.hold.length){ box.innerHTML='<div class="empty-state"><div class="es-icon">💼</div><div class="es-title">暂无持仓</div><div class="es-desc">在上方输入代码、数量、成本价，点「加持仓」开始记录。<br>持仓与自选互相独立，不必先加自选。</div><div class="es-actions"><button class="ghost" onclick="goView(\'market\')">去行情看板选标的 →</button></div></div>'; sum.innerHTML=''; return; }
  let totMV=0, totCost=0, totPL=0, totDay=0;
  const groups=[
    {label:'股票 / ETF', items: state.hold.filter(h=>!isFundKind(h.code))},
    {label:'基金',       items: state.hold.filter(h=>isFundKind(h.code))}
  ];
  let html='';
  groups.forEach(g=>{
    if(!g.items.length) return;
    let gmv=0,gcost=0,gpl=0,gday=0, rows='';
    g.items.forEach(h=>{
      const p=priceOf(h.code), n=h.shares, c=h.cost;
      const m=n*p, co=n*c, pl=m-co, plp=co?pl/co*100:0;
      let day=0;
      if(isFundKind(h.code)){ const _bare=String(h.code).replace(/^(sz|sh|hk|us)/i,''); if(needsFund(_bare)) loadFund(h.code); const fd=state.fundData[_bare]; if(fd&&fd.prev) day=n*(fd.latest-fd.prev); }
      else { const q=state.quotes[h.code]; if(q&&q.changePct!=null) day=m*q.changePct/(100+q.changePct); }
      day=Math.round(day*100)/100;
      totMV+=m; totCost+=co; totPL+=pl; totDay+=day; gmv+=m; gcost+=co; gpl+=pl; gday+=day;
      const need=(p>0&&c>0&&p<c)?(((c-p)/p)*100):0;
      rows+='<tr><td><div class="name-cell"><span class="nm">'+nameOf(h.code)+'</span><span class="cd">'+h.code+'</span></div></td>'
        +'<td><input class="ain" type="number" step="1" min="0" data-ai="shares" data-code="'+h.code+'" value="'+(n||0)+'" placeholder="数量" style="width:64px;"></td>'
        +'<td><input class="ain" type="number" step="0.01" min="0" data-ai="cost" data-code="'+h.code+'" value="'+(c||0)+'" placeholder="成本" style="width:64px;"></td>'
        +'<td>'+fmt(p)+'</td><td>'+fmt(m)+'</td>'
        +'<td class="'+cls(pl)+'">'+fmt(pl)+'<div class="cellsub">'+(need>0?('回本需涨 +'+need.toFixed(2)+'%'):'')+'</div></td><td class="'+cls(plp)+'">'+pct(plp)+'</td>'
        +'<td class="'+cls(day)+'">'+fmt(day)+'</td>'
        +'<td><input class="ain" type="number" step="0.01" min="0" data-ai="target" data-code="'+h.code+'" value="'+(h.target?h.target:'')+'" placeholder="止盈"></td>'
        +'<td><input class="ain" type="number" step="0.01" min="0" data-ai="stop" data-code="'+h.code+'" value="'+(h.stop?h.stop:'')+'" placeholder="止损"></td>'
        +'<td><button class="danger" data-hdel="'+h.code+'" style="padding:2px 7px;font-size:11px;">删</button></td></tr>';
    });
    html+='<div class="hold-group"><div class="hg-title">'+g.label+'<span class="hg-sub">小计 市值 '+fmt(gmv)+' · 盈亏 <b class="'+cls(gpl)+'">'+fmt(gpl)+'</b> · 当日 <b class="'+cls(gday)+'">'+fmt(gday)+'</b></span></div>'
      +'<table><thead><tr><th>名称</th><th>数量</th><th>成本</th><th>现价</th><th>市值</th><th>盈亏</th><th>收益率</th><th>当日盈亏</th><th>止盈价</th><th>止损价</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  });
  box.innerHTML=html;
  sum.innerHTML='<div class="stat"><div class="k">总市值</div><div class="v">'+fmt(totMV)+'</div></div>'
    +'<div class="stat"><div class="k">总持仓成本</div><div class="v">'+fmt(totCost)+'</div></div>'
    +'<div class="stat"><div class="k">总浮动盈亏</div><div class="v '+(cls(totPL))+'">'+fmt(totPL)+' ('+pct(totCost?totPL/totCost*100:0)+')</div></div>'
    +'<div class="stat"><div class="k">当日盈亏</div><div class="v '+(cls(totDay))+'">'+fmt(totDay)+'</div></div>';
  box.querySelectorAll('button[data-hdel]').forEach(b=>b.onclick=()=>{ state.hold=state.hold.filter(h=>h.code!==b.dataset.hdel); save(); renderHold(); renderWatch(); });
  box.querySelectorAll('input[data-ai]').forEach(inp=>{ inp.onchange=()=>{
    const code=inp.dataset.code, f=inp.dataset.ai, v=parseFloat(inp.value);
    const h=state.hold.find(x=>x.code===code); if(!h) return;
    h[f] = (v>0)? v : 0; save();
    if(f==='shares'||f==='cost'){ renderHold(); }   // 数量/成本变了→重算市值盈亏
    else if(code===state.selected){ const wk=(state.watch.find(x=>x.code===code)||{}); if(wk.kind!=='fund') renderDetail(); }
  }; });
}


/* ============ 交互 ============ */

/* ============ 添加/清洗时自动识别 股票 or 基金 ============ */
function loadScriptOnce(url){ return new Promise(res=>{ const s=document.createElement('script'); s.src=url; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); setTimeout(()=>res(false),8000); }); }
async function eastmoneyName(bare){              // 东方财富查基金真实全名
  const w=window, prev=w.fS_name; w.fS_name=undefined;
  await loadScriptOnce('https://fund.eastmoney.com/pingzhongdata/'+bare+'.js?t='+Date.now());
  const n=w.fS_name; w.fS_name=prev;
  return (typeof n==='string'&&n&&n.indexOf('error')<0)? n : null;
}
async function tencentName(code){               // 腾讯查股票名(GBK解码)
  try{ const r=await fetch('https://qt.gtimg.cn/q='+code); const buf=await r.arrayBuffer(); const s=new TextDecoder('gb18030').decode(buf); const m=s.match(/v_[\w]+\s*=\s*"([^"]*)"/); if(!m) return null; const f=m[1].split('~'); if(f[1]&&f[3]&&f[3]!=='0') return f[1]; }catch(e){} return null;
}
async function detectKind(raw){
  raw=String(raw||"").trim();
  if(/^(sh|sz|hk|us)/i.test(raw)){              // 带市场前缀 → 明确股票，先查腾讯
    const nm=await tencentName(raw.toLowerCase()); if(nm) return {code:raw.toLowerCase(),kind:'stock'};
    const bare=raw.replace(/^(sh|sz|hk|us)/i,''); const fn=await eastmoneyName(bare); if(fn) return {code:bare,kind:'fund',name:fn};
    return {code:raw.toLowerCase(),kind:'stock'};
  }
  if(/^\d{6}$/.test(raw)){                       // 裸6位 → ETF优先走股票实时行情，其余先试基金
    const etfRe=/^(50|51|52|56|58|59|15)\d{4}$/; // 场内 ETF/LOF 特征码：159 深圳ETF；50/51/52/56/58/59 上海ETF/基金
    if(etfRe.test(raw)){
      const pref=raw[0]==='1'?'sz':'sh';
      const nm=await tencentName(pref+raw); if(nm) return {code:pref+raw,kind:'stock'};
      const fn=await eastmoneyName(raw); if(fn) return {code:raw,kind:'fund',name:fn};
      return {code:pref+raw,kind:'stock'};       // 离线也按股票占位，避免错显基金无净值
    }
    const fn=await eastmoneyName(raw); if(fn) return {code:raw,kind:'fund',name:fn};
    const pref=raw[0]==='6'?'sh':'sz'; const nm=await tencentName(pref+raw); if(nm) return {code:pref+raw,kind:'stock'};
    return {code:raw,kind:'fund'};               // 都查不到(含离线)→默认基金裸码，避免 sz 前缀错显
  }
  if(/^\d{5}$/.test(raw)) return {code:'sz'+raw,kind:'stock'};
  return {code:raw,kind:'stock'};
}
/* 建仓分析：标的选择器（不依赖去自选点，直接下拉/输代码切换） */
function populateAnSel(){
  const sel=$('anSel'); if(!sel) return;
  const cur=state.selected;
  let html='<option value="">— 选择标的 —</option>';
  state.watch.forEach(w=>{ const nm=nameOf(w.code); const k=w.kind==='fund'?'基':'股'; html+='<option value="'+w.code+'">'+nm+' ('+w.code+') · '+k+'</option>'; });
  sel.innerHTML=html; sel.value=cur||'';
}
$('anSel').onchange=()=>{ const c=$('anSel').value; if(c) selectCode(c); };
$('btnAnGo').onclick=()=>{ const v=$('anCode').value.trim(); if(v){ addWatch(v); $('anCode').value=''; } };
$('anCode').addEventListener('keydown',e=>{ if(e.key==='Enter') $('btnAnGo').click(); });

function addWatch(raw){                          // 自动识别：输入代码即可，无需手动选股票/基金
  raw=String(raw||"").trim();
  if(!raw){ alert('请输入代码'); return; }
  const btn=$('btnAdd'); if(btn){ btn.disabled=true; btn.textContent='识别中…'; }
  detectKind(raw).then(r=>{
    if(btn){ btn.disabled=false; btn.textContent='加自选'; }
    if(state.watch.some(w=>w.code===r.code)){ selectCode(r.code); toast('✓ 已自动保存'); return; }
    state.watch.push({code:r.code, kind:r.kind, cat:((state.watchCat&&state.watchCat!=='all')?state.watchCat:'def')});
    save(); toast('✓ 已自动保存到本机浏览器');
    if(r.kind==='fund'){ if(r.name) state.fundData[r.code]={name:r.name, nav:[], latest:0, prev:0, cum:[]}; loadFund(r.code); }
    else refreshQuotes();
    renderWatch(); renderHoldSelect(); selectCode(r.code);
  }).catch(()=>{ if(btn){ btn.disabled=false; btn.textContent='加自选'; } alert('识别失败，请重试'); });
}
function cleanseWatch(){                         // 异步清洗历史被误加 sz/sh 前缀的基金码
  state.watch.forEach(w=>{
    if(/^(sh|sz|hk)(\d{6})$/i.test(w.code) || /^\d{6}$/.test(w.code)){
      detectKind(w.code).then(r=>{
        if(r.code!==w.code || r.kind!==w.kind){
          w.code=r.code; w.kind=r.kind; save();
          if(r.kind==='fund'){ if(r.name) state.fundData[r.code]={name:r.name,nav:[],latest:0,prev:0,cum:[]}; loadFund(r.code); } else refreshQuotes();
          renderWatch(); renderHoldSelect();
        }
      }).catch(()=>{});
    }
  });
}
function cleanseHold(){                          // 异步清洗历史被误存成股票的基金码(如 sz012863→012863+基金)
  state.hold.forEach(h=>{
    if(/^(sh|sz|hk)(\d{6})$/i.test(h.code) || /^\d{6}$/.test(h.code)){
      detectKind(h.code).then(r=>{
        if(r.code!==h.code || r.kind!==h.kind){
          h.code=r.code; h.kind=r.kind; save();
          if(r.kind==='fund'){ if(r.name) state.fundData[r.code]={name:r.name,nav:[],latest:0,prev:0,cum:[]}; loadFund(r.code); } else refreshQuotes();
          renderHold(); renderHoldSelect();
        }
      }).catch(()=>{});
    }
  });
}
function delWatch(code){ state.watch=state.watch.filter(w=>w.code!==code); if(state.selected===code) state.selected=null; save(); renderWatch(); renderHoldSelect(); if(state.view==='analysis') populateAnSel(); if(!state.selected){ $('detail').style.display='none'; $('detailEmpty').style.display='block'; hideMarketFund(); } }
function selectCode(code){
  state.selected=code;
  const w=state.watch.find(x=>x.code===code);
  renderWatch();
  const isFund = !!(w && isFundKind(w.code));
  if(isFund && needsFund(code)) loadFund(code);
  const v=state.view;
  // 建仓分析同时支持股票/基金 → 原地刷新，绝不切走（修复"看A基金分析、点B基金被拽走"）
  if(v==='analysis'){ state.anaMode='single'; renderAnalysis(); return; }  // 切到新标的→退出组合模式，回到单只研判
  // 基金深度分析用独立输入框，不抢当前视图
  if(v==='fundAnalysis'){ return; }
  // 行情看板同时支持股票(K线)与基金(净值)：点基金原地画净值，不跳到基金工作区
  if(isFund){
    if(v==='market'){
      showMarketFund(code);          // 行情看板内直接看净值，不切走
    } else {
      if(v!=='fund') showView('fund');
      renderFund();
    }
  } else {
    if(v!=='market') showView('market');
    hideMarketFund();
    renderDetail();
  }
}

$('btnAdd').onclick=()=>{ const v=$('addInput').value; if(v.trim()){ addWatch(v); $('addInput').value=''; } };
$('addInput').addEventListener('keydown',e=>{ if(e.key==='Enter') $('btnAdd').click(); });
$('btnDemo').onclick=()=>{
  [['sh600519','stock'],['sz300750','stock'],['sh510300','stock'],['hk00700','stock'],['000001','fund']].forEach(([c,k])=>{ if(!state.watch.some(w=>w.code===c)) state.watch.push({code:c,kind:k}); });
  save(); fundCodesToLoad().forEach(c=>loadFund(c)); refreshQuotes(); renderWatch(); renderHoldSelect();
};
$('btnClear').onclick=()=>{ if(confirm('清空全部自选？')){ state.watch=[]; state.selected=null; save(); renderWatch(); renderHoldSelect(); $('detail').style.display='none'; $('detailEmpty').style.display='block'; hideMarketFund(); } };
async function addHold(raw, shares, cost){
  raw=String(raw||"").trim();
  if(!raw||!(shares>0)||!(cost>0)){ alert('请填代码、数量与成本价'); return; }
  const btn=$('btnAddHold'); if(btn){ btn.disabled=true; btn.textContent='识别中…'; }
  try{
    const r=await detectKind(raw);
    const ex=state.hold.find(h=>h.code===r.code);
    if(ex){ ex.shares=shares; ex.cost=cost; }
    else state.hold.push({code:r.code, kind:r.kind, shares, cost});
    if(!state.watch.some(w=>w.code===r.code)){ state.watch.push({code:r.code, kind:r.kind}); } // 加持仓同步进自选：自选可见行情+持仓中角标
    save(); toast('✓ 已自动保存（持仓已记录）');
    if(r.kind==='fund'){ if(r.name) state.fundData[r.code]={name:r.name,nav:[],latest:0,prev:0,cum:[]}; loadFund(r.code); }
    else { await ensureStockQuote(r.code); }
    refreshQuotes();
    renderWatch(); renderHold(); renderHoldSelect();
  }catch(e){ alert('识别失败，请重试'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='加持仓'; } $('holdCode').value=''; $('holdShares').value=''; $('holdCost').value=''; }
}
$('btnAddHold').onclick=()=>{ const code=$('holdCode').value; const sh=parseFloat($('holdShares').value); const co=parseFloat($('holdCost').value); addHold(code, sh, co); };
$('btnClearHold').onclick=()=>{ if(confirm('清空全部持仓？')){ state.hold=[]; save(); renderHold(); renderWatch(); } };
$('btnExport').onclick=()=>{ const data={watch:state.watch, hold:state.hold, v:2, exported:new Date().toISOString()}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='我的自选持仓备份_'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href); };
$('btnImport').onclick=()=>$('fileImport').click();
$('fileImport').onchange=e=>{ const f=e.target.files&&e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{ try{ const d=JSON.parse(rd.result); if(Array.isArray(d.watch)) state.watch=d.watch; if(Array.isArray(d.hold)) state.hold=d.hold; save(); toast('✓ 备份已导入并保存'); fundCodesToLoad().forEach(c=>loadFund(c)); refreshQuotes(); renderWatch(); renderHold(); renderHoldSelect(); alert('导入成功：'+state.watch.length+' 个自选、'+state.hold.length+' 笔持仓'); }catch(err){ alert('文件格式不对，导入失败'); } }; rd.readAsText(f); e.target.value=''; };
$('btnRefresh').onclick=()=>{ refreshQuotes(()=>{ if(state.view==='flow') renderFlow(); }); fundCodesToLoad().forEach(c=>loadFund(c, true)); };
// MACD 参数预设下拉：切换档位 → 副图+速览卡按新参数计算，大师评级不变
(function(){
  const sel=$('macdPreset'); if(!sel) return;
  Object.keys(MACD_PRESETS).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=MACD_PRESETS[k].label; sel.appendChild(o); });
  sel.value='std';
  sel.onchange=()=>{
    const p=MACD_PRESETS[sel.value]; if(!p) return;
    state.macdParam={fast:p.fast, slow:p.slow, signal:p.signal};
    const t=$('macdTitle'); if(t) t.textContent='MACD ('+p.fast+','+p.slow+','+p.signal+')';
    const w=state.watch.find(x=>x.code===state.selected);
    if(state.selected && w && w.kind!=='fund') renderDetail();
    if(state.view==='analysis') renderAnalysis();
  };
})();
$('btnPortfolioAna').onclick=()=>{ renderPortfolioAnalysis(); };
$('refreshSel').onchange=()=>{ CFG.refreshMs=parseInt($('refreshSel').value,10)||5000; if(state.auto){ stopTimer(); startTimer(); } };
$('btnAuto').onclick=()=>{ state.auto=!state.auto; $('btnAuto').textContent='自动：'+(state.auto?'开':'关'); if(state.auto) startTimer(); else stopTimer(); };
$('btnSectorScan').onclick=()=>renderSectors();
$('btnAddSector').onclick=()=>addCustomSector();
$('btnSectorCopy').onclick=()=>exportSectorText();
$('btnSectorImg').onclick=()=>exportSectorImage();
