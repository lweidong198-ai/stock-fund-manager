/* =========================================================================
 * app.js
 * 模块来源小节：视图切换 / 数据中心绑定 / 启动
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 视图切换 ============ */
/* ============ 视图分组（整合：3个决策入口，每组含2个子视图Tab） ============ */
const VIEW_GROUPS = {
  discovery: { tabs:[
    {key:'fund', disp:'grid', render:renderOpportunities},
    {key:'fundAnalysis', disp:'grid', render:renderFundAnalysis}
  ], def:'fund' },
  radar: { tabs:[
    {key:'sectors', disp:'block', render:renderSectors},
    {key:'rotation', disp:'block', render:renderRotation}
  ], def:'sectors' },
  timing: { tabs:[
    {key:'analysis', disp:'block', render:renderAnalysis},
    {key:'flow', disp:'block', render:renderFlow}
  ], def:'analysis' }
};
function setNavOn(v){
  document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('on', n.dataset.view===v));
}
function showView(v, keepNav){
  ['home','market','hold','review','fund','fundAnalysis','sectors','rotation','analysis','flow','datacenter','rebalance'].forEach(x=>{
    const el=$('view'+x.charAt(0).toUpperCase()+x.slice(1));
    if(el) el.style.display=(x===v)?((x==='market'||x==='fund'||x==='fundAnalysis')?'grid':'block'):'none';
  });
  if(!keepNav) setNavOn(v);
  state.view=v;
  if(v==='home') renderHome();
  if(v==='hold') renderHold();
  if(v==='review' && typeof renderReview==='function') renderReview();
  if(v==='analysis'){ state.anaMode='single'; populateAnSel(); renderAnalysis(); }
}
function renderSubTabs(g){
  const cfg=VIEW_GROUPS[g];
  const cur=(state.subView&&state.subView[g])||cfg.def;
  const labels={fund:'本期精选',fundAnalysis:'基金体检',sectors:'趋势方向',rotation:'冷热排行',analysis:'建仓打分',flow:'资金流向'};
  document.querySelectorAll('[data-stb="'+g+'"]').forEach(bar=>{
    bar.innerHTML = cfg.tabs.map(t=>'<span class="stab'+(t.key===cur?' on':'')+'" onclick="showSub(\''+g+'\',\''+t.key+'\')">'+(labels[t.key]||t.key)+'</span>').join('');
  });
}
function showSub(g, sub){
  const cfg=VIEW_GROUPS[g];
  cfg.tabs.forEach(t=>{
    const el=$('view'+t.key.charAt(0).toUpperCase()+t.key.slice(1));
    if(el) el.style.display=(t.key===sub)?t.disp:'none';
  });
  setNavOn(g);
  state.view=sub;
  state.subView=state.subView||{}; state.subView[g]=sub;
  renderSubTabs(g);
  const active=cfg.tabs.find(t=>t.key===sub);
  if(active){
    if(sub==='analysis'){ state.anaMode='single'; populateAnSel(); }
    if(typeof active.render==='function') active.render();
  }
}
function enterGroup(g){
  ['home','market','hold','fund','fundAnalysis','sectors','rotation','analysis','flow','datacenter','rebalance'].forEach(x=>{ const el=$('view'+x.charAt(0).toUpperCase()+x.slice(1)); if(el) el.style.display='none'; });
  const sub=(state.subView&&state.subView[g])||VIEW_GROUPS[g].def;
  showSub(g, sub);
}
/* 统一入口：点导航/首页卡片都走这里。智能保证"当前视图能展示当前选中的资产"，避免空白与层次冲突 */
function goView(v){
  if(v==='discovery'){ enterGroup('discovery'); return; }
  if(v==='radar'){ enterGroup('radar'); return; }
  if(v==='timing'){ enterGroup('timing'); return; }
  if(v==='market'){
    // 行情看板同时支持股票(K线)与基金(净值)，不再强制把基金选中改成股票
    showView('market');
    const cur=state.watch.find(x=>x.code===state.selected);
    if(state.selected && cur && cur.kind==='fund'){
      showMarketFund(state.selected);
    } else if(state.selected && cur && cur.kind!=='fund'){
      renderDetail();
    } else {
      $('detailEmpty').style.display='block'; $('detail').style.display='none'; if($('quoteCard')) $('quoteCard').style.display='none';
    }
    return;
  }
  if(v==='fund'){
    showView('fund'); renderOpportunities(); return;
  }
  if(v==='analysis'){
    if(!state.watch.some(x=>x.code===state.selected)){ const f=state.watch[0]; if(f) state.selected=f.code; }
    showView('analysis'); renderAnalysis(); return;
  }
  if(v==='fundAnalysis'){ showView('fundAnalysis'); renderFundAnalysis(); return; }
  if(v==='sectors'){ showView('sectors'); renderSectors(); return; }
  if(v==='rotation'){ showView('rotation'); renderRotation(); return; }
  if(v==='flow'){ showView('flow'); renderFlow(); return; }
  if(v==='datacenter'){ showView('datacenter'); renderDataCenter(); return; }
  if(v==='rebalance'){ showView('rebalance'); renderRebalance(); return; }
  showView(v); // home / hold
}


/* ============ 数据中心绑定 ============ */
if($('btnDcFund')) $('btnDcFund').onclick=()=>dcRunFund();
if($('btnDcVal')) $('btnDcVal').onclick=()=>dcRunVal();
if($('btnDcCorr')) $('btnDcCorr').onclick=()=>dcRunCorr();
if($('btnDcDca')) $('btnDcDca').onclick=()=>dcRunDca();
if($('dcFundInput')) $('dcFundInput').addEventListener('keydown',e=>{ if(e.key==='Enter') dcRunFund(); });
if($('dcFundSel')) $('dcFundSel').onchange=()=>dcRunFund();
if($('dcDcaSel')) $('dcDcaSel').onchange=()=>dcRunDca();
if($('btnRotation')) $('btnRotation').onclick=()=>renderRotation();
renderCustomList();

document.querySelectorAll('#periodTg .tg').forEach(t=>t.onclick=()=>{ document.querySelectorAll('#periodTg .tg').forEach(x=>x.classList.remove('on')); t.classList.add('on'); state.period=t.dataset.p; if(state.selected) renderDetail(); });
document.querySelectorAll('#indTg .tg').forEach(t=>t.onclick=()=>{ const i=t.dataset.i; state.ind[i]=!state.ind[i]; t.classList.toggle('on',state.ind[i]); if(state.selected) renderDetail(); });
// K线时间档位
function goLatestKline(){
  const main=$('klineMain'); if(!main||!main._kl) return;
  const n=main._kl.length;
  ensureVP(main,n);
  main._vp.count=Math.min(n,main._vp.count>0?main._vp.count:VP_DEF);
  main._vp.start=Math.max(0,n-main._vp.count); main._vp.n=n;
  syncVP(main,['paneMACD','paneKDJ','paneRSI'],n);
  drawAll(main._kl);
}
document.querySelectorAll('#klineRange .tg').forEach(t=>t.onclick=()=>{
  if(t.dataset.type==='latest'){
    document.querySelectorAll('#klineRange .tg').forEach(x=>x.classList.remove('on')); t.classList.add('on');
    goLatestKline(); return;
  }
  document.querySelectorAll('#klineRange .tg').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  const main=$('klineMain'); if(!main||!main._kl) return;
  setVPRange('klineMain', parseInt(t.dataset.days,10), main._kl.length);
  syncVP(main,['paneMACD','paneKDJ','paneRSI'],main._kl.length);
  drawAll(main._kl);
});
// 基金净值时间档位
document.querySelectorAll('#fundRange .tg').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('#fundRange .tg').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  const cv=$('fundCanvas'); if(!cv||!cv._fd) return;
  setVPRange('fundCanvas', parseInt(t.dataset.days,10), cv._fd.nav.length);
  drawNav('fundCanvas', cv._fd);
});
// 基金深度分析时间档位
function bindFaRange(groupSelector, targetCvId, syncIds){
  document.querySelectorAll(groupSelector).forEach(t=>t.onclick=()=>{
    const container=t.closest('.range-group');
    container.querySelectorAll('.tg').forEach(x=>x.classList.remove('on')); t.classList.add('on');
    const cv=$(targetCvId); if(!cv||!cv._A) return;
    const n=cv._A.vals.length;
    setVPRange(targetCvId, parseInt(t.dataset.days,10), n);
    if(syncIds&&syncIds.length) syncVP(cv,syncIds,n);
    if(cv._redraw) cv._redraw();
  });
}
bindFaRange('[data-group="faMain"] .tg','faNavCanvas',['faGrowthCanvas','faDDCanvas']);
bindFaRange('[data-group="faRoll"] .tg','faRollCanvas',[]);
document.querySelectorAll('[data-group="faHeat"] .tg').forEach(t=>t.onclick=()=>{
  const container=t.closest('.range-group');
  container.querySelectorAll('.tg').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  const cv=$('faHeatCanvas'); if(!cv||!cv._A) return;
  cv._heatYears=parseInt(t.dataset.years,10);
  if(cv._redraw) cv._redraw();
});
document.querySelectorAll('#watchFilter .tg').forEach(t=>t.onclick=()=>{
  state.watchFilter=t.dataset.f;
  document.querySelectorAll('#watchFilter .tg').forEach(x=>x.classList.remove('on'));
  t.classList.add('on');
  renderWatch();
});
// —— 自选「列表 / 整体」视图切换 ——
document.querySelectorAll('#watchViewToggle .tg').forEach(t=>t.onclick=()=>{
  state.watchView=t.dataset.v; save(); syncWatchViewToggle(); renderWatch();
});
// —— 自选自定义分类：事件委托（#watchCats 内容由 renderWatchCats 动态重建，故用委托） ——
$('watchCats').addEventListener('click', e=>{
  const addBtn = e.target.closest('[data-addcat]');
  if(addBtn){ addWatchCat(); return; }
  const delBtn = e.target.closest('[data-delcat]');
  if(delBtn){ delWatchCat(delBtn.dataset.delcat); return; }
  const chip = e.target.closest('[data-cat]');
  if(chip){ state.watchCat = chip.dataset.cat; renderWatchCats(); renderWatch(); }
});
$('watchCats').addEventListener('dblclick', e=>{
  const chip = e.target.closest('[data-cat]');
  if(chip && chip.dataset.cat && chip.dataset.cat!=='all'){ renameWatchCat(chip.dataset.cat); }
});
document.querySelectorAll('.navitem').forEach(t=>t.onclick=()=>goView(t.dataset.view));

let timer=null;
function startTimer(){ if(timer)return; timer=setInterval(refreshQuotes, CFG.refreshMs); }
function stopTimer(){ if(timer){clearInterval(timer);timer=null;} }
window.addEventListener('resize',()=>{ if(state.selected){ const w=state.watch.find(x=>x.code===state.selected); if(w&&w.kind==='fund'){ if(state.view==='market') showMarketFund(state.selected); } else renderDetail(); } });


/* ============ 启动 ============ */
(function(){ try{ localStorage.setItem('_sfm_t','1'); localStorage.removeItem('_sfm_t'); hideStorageWarn(); }catch(e){ showStorageWarn(); } })(); // 启动即探明本地存储是否可用
load(); bindFaHover();
refreshIndices();
showView('home');
if(!state.selected && state.watch.length){ state.selected=state.watch[0].code; } // 默认选中第一只，避免初次进各视图空白
renderWatch(); renderHold(); renderHoldSelect();
const _funds=fundCodesToLoad();
if(_funds.length){ _funds.forEach(c=>loadFund(c)); } refreshQuotes();
renderGlobalRegime();   // 顶部常驻市况战略透镜（异步拉沪深300近60日，不阻塞首屏）
startTimer();

