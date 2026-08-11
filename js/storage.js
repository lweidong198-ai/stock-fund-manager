/* =========================================================================
 * storage.js
 * 模块来源小节：持久化
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 持久化 ============ */
function toast(msg){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.remove('show'),1900); }
function showStorageWarn(){ const w=document.getElementById('storageWarn'); if(w) w.style.display='block'; }
function hideStorageWarn(){ const w=document.getElementById('storageWarn'); if(w) w.style.display='none'; }
function save(){
  try{
    localStorage.setItem(LS_WATCH, JSON.stringify(state.watch));
    localStorage.setItem(LS_HOLD, JSON.stringify(state.hold));
    localStorage.setItem(LS_WATCH_CATS, JSON.stringify({cats:state.watchCats, cur:state.watchCat}));
    hideStorageWarn();
  }catch(e){ showStorageWarn(); }   // 无痕/隐私模式或浏览器禁存储 → 弹警告，避免误以为已保存
}
function load(){
  try{ state.watch = JSON.parse(localStorage.getItem(LS_WATCH)||'[]'); }catch(e){ state.watch=[]; }
  try{ state.hold  = JSON.parse(localStorage.getItem(LS_HOLD)||'[]'); }catch(e){ state.hold=[]; }
  // 自选自定义分类：加载 + 迁移旧自选(无 cat 字段→默认分类)
  try{
    const cd = JSON.parse(localStorage.getItem(LS_WATCH_CATS)||'null');
    if(cd && Array.isArray(cd.cats) && cd.cats.length){
      state.watchCats = cd.cats;
      state.watchCat = (typeof cd.cur==='string') ? cd.cur : 'all';
    }
  }catch(e){}
  if(!Array.isArray(state.watchCats) || !state.watchCats.length){ state.watchCats=[{id:'def',name:'默认'}]; }
  if(!state.watchCats.some(c=>c.id==='def')) state.watchCats.unshift({id:'def',name:'默认'});
  state.watch.forEach(w=>{ if(!w.cat) w.cat='def'; });
  // 首次打开（无本地自选）→ 塞入示例自选，避免页面一打开全空
  if(!state.watch.length){
    state.watch = [
      {code:'sh600519', kind:'stock', cat:'def'},
      {code:'sz000858', kind:'stock', cat:'def'},
      {code:'sh601318', kind:'stock', cat:'def'},
      {code:'000001', kind:'fund', cat:'def'},
      {code:'161725', kind:'fund', cat:'def'}
    ];
    save();
  }
  if(!state.selected) state.selected = (state.watch.find(w=>w.kind==='stock')||state.watch[0]||{}).code || null;
  cleanseWatch(); cleanseHold(); // 异步清洗历史被误加/误存的基金码(如 sz012863→012863+基金、600519 股票不会被当基金)
}

