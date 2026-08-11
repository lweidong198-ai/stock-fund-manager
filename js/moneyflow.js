/* =========================================================================
 * moneyflow.js
 * 模块来源小节：资金流向（零门槛·腾讯内外盘主动买卖力道）
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 资金流向（零门槛·腾讯内外盘主动买卖力道） ============ */
function toSecid(code){
  if(code.startsWith('sh')) return '1.'+code.slice(2);
  if(code.startsWith('sz')) return '0.'+code.slice(2);
  if(code.startsWith('hk')) return '116.'+code.slice(2);
  if(code.startsWith('us')) return '100.'+code.slice(3).toUpperCase();
  return '';
}
function fmtMoney(v){
  if(v==null||isNaN(v)) return '—';
  const a=Math.abs(v);
  if(a>=1e8) return (v/1e8).toFixed(2)+'亿';
  if(a>=1e4) return (v/1e4).toFixed(2)+'万';
  return v.toFixed(0)+'元';
}
// 东方财富 真实主力资金净流入（零Key·JSONP绕过CORS）。kline klt=1 lmt=1 返回今日累计主力净流入(额)。
function loadFundFlow(code, cb){
  const secid=toSecid(code);
  if(!secid){ cb({err:'nosecid'}); return; }
  const cbName='emff'+Math.random().toString(36).slice(2,10);
  const t=Date.now();
  const url='https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=1&klt=1&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid='+encodeURIComponent(secid)+'&cb='+cbName+'&_='+t;
  let done=false;
  window[cbName]=function(json){
    if(done) return; done=true;
    try{
      const kl=json&&json.data&&json.data.klines;
      if(!kl||!kl.length){ cb({err:'empty'}); return; }
      const p=kl[0].split(',');
      const main=parseFloat(p[1]);          // f52 主力净流入(元)
      const mainPct=parseFloat(p[6]);      // f57 主力净占比(%)
      cb({main, mainPct:isNaN(mainPct)?null:mainPct, time:p[0], raw:p});
    }catch(e){ cb({err:'parse'}); }
  };
  const s=document.createElement('script');
  s.src=url;
  s.onerror=function(){ if(!done){ done=true; cb({err:'net'}); } if(s.parentNode) s.parentNode.removeChild(s); };
  s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
  document.body.appendChild(s);
  setTimeout(function(){ if(!done){ done=true; cb({err:'timeout'}); } }, 8000); // 超时兜底(离线/不可达)
}
function flowPick(code){ state.selected=code; renderFlow(); }
function renderFlow(){
  const view=$('viewFlow'); if(!view) return;
  const sel=state.selected;
  const q=state.quotes[sel];
  const w=state.watch.find(x=>x.code===sel);
  const selEl=$('flowSel');
  const name=nameOf(sel);
  const fmtTs = s => { if(!s) return ''; const m=(''+s).match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/); return m? (m[1]+'-'+m[2]+'-'+m[3]+' '+m[4]+':'+m[5]+':'+m[6]) : (''+s); };
  // —— 腾讯内外盘 + 五档（确定正确，即时）——
  if(!q || (!q.outer && !q.inner && (!q.bid||!q.bid.length) && (!q.ask||!q.ask.length))){
    selEl.innerHTML='<div class="flow-name">'+name+' <span class="code">'+sel+'</span></div><div class="empty">当前选中「'+name+'」行情还在加载，或暂无内外盘数据（美股/基金无此字段）。<br>等行情刷新、或点左侧自选列表任意一行即可。</div>';
  } else {
    const outer=q.outer||0, inner=q.inner||0, tot=outer+inner;
    const buyPct=tot>0?outer/tot*100:50;
    let bidVol=0, askVol=0;
    (q.bid||[]).forEach(b=>bidVol+=(b[1]||0));
    (q.ask||[]).forEach(a=>askVol+=(a[1]||0));
    const depthTot=bidVol+askVol; const bidPct=depthTot>0?bidVol/depthTot*100:50;
    selEl.innerHTML=
      '<div class="flow-name">'+name+' <span class="code">'+sel+'</span></div>'+
      '<div class="sub-h2">💹 主动买卖力道（腾讯·内外盘）</div>'+
      '<div class="bar2"><div class="bar-fill bar-buy" style="width:'+buyPct+'%">主动买 '+buyPct.toFixed(1)+'%</div><div class="bar-fill bar-sell" style="width:'+(100-buyPct)+'%">主动卖 '+(100-buyPct).toFixed(1)+'%</div></div>'+
      '<div class="kv-row"><span>主动买（外盘）</span><b class="up">'+fmt(outer)+' 手</b></div>'+
      '<div class="kv-row"><span>主动卖（内盘）</span><b class="down">'+fmt(inner)+' 手</b></div>'+
      '<div class="sub-h2">📶 五档盘口委托力道</div>'+
      '<div class="bar2"><div class="bar-fill bar-bid" style="width:'+bidPct+'%">买盘 '+bidPct.toFixed(1)+'%</div><div class="bar-fill bar-ask" style="width:'+(100-bidPct)+'%">卖盘 '+(100-bidPct).toFixed(1)+'%</div></div>'+
      '<div class="kv-row"><span>买一~买五委托</span><b class="up">'+fmt(bidVol)+'</b></div>'+
      '<div class="kv-row"><span>卖一~卖五委托</span><b class="down">'+fmt(askVol)+'</b></div>'+
      '<div class="meta" style="margin-top:8px;">🕒 数据时间：'+(fmtTs(q.time)||'—')+'</div>';
  }
  // —— 东方财富 真实主力净流入（异步）——
  selEl.innerHTML += '<div class="sub-h2">💰 主力资金净流入（东方财富）</div><div id="flowMainCard" class="flow-big">获取中…</div><div class="meta" id="flowMainTime" style="font-size:11px;color:#888">数据来源：东方财富公开行情接口（主力净流入 = 超大单 + 大单净买入）</div>';
  if(sel && !sel.startsWith('us')){
    loadFundFlow(sel, function(ff){
      const card=$('flowMainCard'); if(!card) return;
      const timeEl=$('flowMainTime');
      if(ff && !isNaN(ff.main)){
        const mc=ff.main>0?'up':(ff.main<0?'down':'flat');
        const sign=ff.main>=0?'+':'';
        const pctTxt=(ff.mainPct!=null)?(' · 占成交额约 '+(ff.mainPct>0?'+':'')+ff.mainPct.toFixed(2)+'%'):'';
        card.innerHTML='<span class="'+mc+'">'+sign+fmtMoney(ff.main)+'</span><div class="meta">今日主力净流入 '+(mc==='up'?'资金流入':(mc==='down'?'资金流出':'均衡'))+pctTxt+'</div>';
        if(timeEl) timeEl.textContent='🕒 数据时间：'+(fmtTs(ff.time)||'当日累计');
        return;
      }
      // 东财不可达 → 回退腾讯内外盘主动买卖净差额（手，沙箱/受限网络也能算，基于真实成交，口径≠券商主力）
      const qq=state.quotes[sel];
      if(qq && (qq.outer||qq.inner)){
        const o=qq.outer||0, i=qq.inner||0, volNet=o-i;   // 净差额(手)：正=主动买入多，负=主动卖出多
        const mc=volNet>0?'up':(volNet<0?'down':'flat');
        const sign=volNet>=0?'+':'';
        const absNet=Math.abs(volNet);
        card.innerHTML='<span class="'+mc+'">'+sign+fmt(absNet)+' 手</span><div class="meta">主动'+(mc==='up'?'买入':'卖出')+'净多（内外盘估算，非券商主力净流入）</div>';
        const tTxt=fmtTs(qq.time)||'实时';
        if(timeEl) timeEl.textContent='⚠ 东方财富暂不可达，以下为 '+tTxt+' 腾讯内外盘主动买卖净差额估算';
        return;
      }
      const errMsg = ff && ff.err==='nosecid' ? '当前代码不支持主力资金流' : (ff && ff.err==='timeout' ? '请求超时' : '东方财富接口暂不可达');
      card.innerHTML='<span class="down">获取失败</span><div class="meta">'+errMsg+'，上方腾讯内外盘数据仍有效。如遇企业网络/沙箱限制，请在普通浏览器打开 GitHub Pages 链接。</div><button class="ghost" style="margin-top:6px;font-size:12px;padding:4px 10px;" onclick="renderFlow()">↻ 重试</button>';
    });
  } else {
    const card=$('flowMainCard'); if(card) card.innerHTML='<span class="flat">美股无主力资金流数据</span>';
  }
  // —— 列表总览（腾讯内外盘，即时）——
  const listEl=$('flowList');
  const codes=new Set();
  state.watch.filter(x=>x.kind!=='fund').forEach(x=>codes.add(x.code));
  state.hold.forEach(h=>codes.add(h.code));
  const rows=[];
  codes.forEach(c=>{
    const qq=state.quotes[c];
    if(!qq || (!qq.outer && !qq.inner)) return;
    const o=qq.outer||0, i=qq.inner||0, t=o+i;
    const buyPct=t>0?o/t*100:50;
    const net=o-i;
    rows.push({code:c, name:nameOf(c), buyPct, net, price:qq.price, cp:qq.changePct});
  });
  rows.sort((a,b)=>b.buyPct-a.buyPct);
  if(!rows.length){ listEl.innerHTML='<div class="empty">暂无股票/ETF 行情数据。点左侧自选列表、或在行情看板加自选后，这里会列出它们的资金力道。</div>'; }
  else {
    const me=$('flowListMeta'); if(me) me.textContent='共 '+rows.length+' 只 · 按主动买入占比排序';
    listEl.innerHTML='<table class="flow-table"><thead><tr><th>名称</th><th>现价</th><th>涨跌%</th><th>主动买占比</th><th>力道</th></tr></thead><tbody>'+
      rows.map(r=>{
        const nc=r.net>0?'up':(r.net<0?'down':'flat');
        return '<tr onclick="flowPick(\''+r.code+'\')"><td>'+r.name+'</td><td>'+fmt(r.price)+'</td><td class="'+cls(r.cp)+'">'+pct(r.cp)+'</td><td><span class="mini-bar"><span class="mini-buy" style="width:'+r.buyPct+'%"></span></span> '+r.buyPct.toFixed(1)+'%</td><td class="'+nc+'">'+(nc==='up'?'流入':(nc==='down'?'流出':'均衡'))+'</td></tr>';
      }).join('')+'</tbody></table>';
  }
}

// 手动刷新资金流向：不跟随全局实时刷新，点按钮才拉最新快照
function refreshFlow(){
  const btn=$('btnFlowRefresh');
  if(btn){ btn.disabled=true; btn.textContent='刷新中…'; }
  refreshQuotes(function(){
    if(state.view==='flow') renderFlow();
    const ft=$('flowRefreshTime'); if(ft) ft.textContent='上次刷新：'+ts()+'（手动快照，不自动刷新）';
    if(btn){ btn.disabled=false; btn.textContent='↻ 手动刷新资金流向'; }
  });
}

