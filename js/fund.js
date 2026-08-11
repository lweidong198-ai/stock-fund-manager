/* =========================================================================
 * fund.js
 * 模块来源小节：场外基金净值：东方财富 pingzhongdata
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 场外基金净值：东方财富 pingzhongdata ============ */
function parseFundJs(text, code){
  // 从东方财富 JS 文本里正则提取净值序列（兜底，不依赖全局变量执行）
  // 注意：东方财富已把 f035/f051 更名为 Data_netWorthTrend(对象数组)/Data_ACWorthTrend(对数组)
  try{
    const m = name => { const x=text.match(new RegExp('var '+name+'\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;')); if(!x) return null; try{ return JSON.parse(x[1]); }catch(e){ return null; } };
    const m2 = name => { const x=text.match(new RegExp('var '+name+'\\s*=\\s*(\\[\\[[\\s\\S]*?\\]\\])\\s*;')); if(!x) return null; try{ return JSON.parse(x[1]); }catch(e){ return null; } };
    const nwt = m('Data_netWorthTrend');   // [{x:毫秒时间戳, y:单位净值}]
    const acw = m2('Data_ACWorthTrend');   // [[毫秒时间戳, 累计净值]]（二维数组，需专用正则）
    const nm = (text.match(/var fS_name\s*=\s*"([^"]*)"/)||[])[1] || code;
    const nav = (nwt||[]).map(p=>({t:p.x, nav:p.y})).filter(p=>p.nav!=null);
    if(!nav.length) return null;
    const last=nav[nav.length-1].nav, prev=nav[nav.length-2]?nav[nav.length-2].nav:last;
    const cum=(acw||[]).map(p=>({t:p[0],nav:p[1]})).filter(p=>p.nav!=null);
    return {nav, cum, latest:last, prev, name:nm};
  }catch(e){ return null; }
}
function applyFundData(code, fd){
  if(!fd) return;
  if(state.fundFail) delete state.fundFail[code];   // 真实净值拿到 → 清除不可达标记
  state.fundData[code]=fd;
  if(state.selected===code){ if(state.view==='market') showMarketFund(code); }
  renderWatch(); renderHold();
  if(state.view==='fundAnalysis' && state.faCode===code) renderFundAnalysis();
  setDemo(false); setDataStatus('ok');
}
function useDemoFund(code){
  const fd=demoFund(code);
  state.fundData[code]=fd;
  if(state.selected===code){ if(state.view==='market') showMarketFund(code); }
  renderWatch(); renderHold();
  if(state.view==='fundAnalysis' && state.faCode===code) renderFundAnalysis();
  setDemo(true); setDataStatus('demo');
}
/* 场外基金采用「串行队列」加载：避免多基金脚本同时注入时互相覆盖全局变量 Data_netWorthTrend 造成竞态错乱 */
var _fundQ=[], _fundBusy=false, _curFundCode=null;
function needsFund(code){ const fd=state.fundData[code]; return !(fd&&fd.nav&&fd.nav.length); }
function loadFund(code, force){
  if(!code) return;
  code=String(code).replace(/^(sz|sh|hk|us)/i,'');  // 规整为东方财富裸码(兼容带前缀的旧持仓数据)
  if(!force && !needsFund(code)) return;                 // 已有真实净值数据则跳过
  if(!force && (_fundQ.indexOf(code)>=0 || _curFundCode===code)) return; // 已在队列/加载中
  if(force){ const i=_fundQ.indexOf(code); if(i>=0) _fundQ.splice(i,1); } // 强制刷新：移除旧任务
  _fundQ.push(code); _pumpFund();
}
function _pumpFund(){
  if(_fundBusy) return;
  const code=_fundQ.shift();
  if(code==null) return;
  if(!needsFund(code)){ _pumpFund(); return; }           // 已被其它路径补齐
  _fundBusy=true; _curFundCode=code;
  const src='https://fund.eastmoney.com/pingzhongdata/'+code+'.js';
  const timeout=setTimeout(()=>{                          // 8秒未回来 → 兜底解析/演示
    _fundBusy=false; _curFundCode=null;
    const fd=parseFundJs(window.__fundRaw&&window.__fundRaw[code]||'');
    if(fd) applyFundData(code,fd); else { (state.fundFail=state.fundFail||{})[code]=true; useDemoFund(code); } // 东方财富不可达：标记失败，行情看板给出提示而非假数据
    _pumpFund();
  }, 8000);
  const s=document.createElement('script'); s.src=src; s.async=true;
  s.onload=function(){
    // 校验全局变量确实属于本 code（防御竞态/超时错乱），再读取
    if(window.fS_code===code && Array.isArray(window.Data_netWorthTrend) && window.Data_netWorthTrend.length){
      clearTimeout(timeout); _fundBusy=false; _curFundCode=null;
      const nav=(window.Data_netWorthTrend||[]).map(p=>({t:p.x, nav:p.y})).filter(p=>p.nav!=null);
      const cum=(window.Data_ACWorthTrend||[]).map(p=>({t:p[0],nav:p[1]})).filter(p=>p.nav!=null);
      applyFundData(code, {nav, cum, latest:nav[nav.length-1].nav, prev:(nav[nav.length-2]?nav[nav.length-2].nav:nav[nav.length-1].nav), name:window.fS_name||code});
      _pumpFund();
    } else { // 全局变量不对 → 兜底 fetch 抓文本解析（CORS 可能失败 → 演示）
      clearTimeout(timeout);
      (state.fundFail=state.fundFail||{})[code]=true; // 东财返回空壳/反爬，先标记不可达
      fetch(src).then(r=>r.text()).then(txt=>{ window.__fundRaw=window.__fundRaw||{}; window.__fundRaw[code]=txt; const fd=parseFundJs(txt,code); _fundBusy=false; _curFundCode=null; if(fd) applyFundData(code,fd); else useDemoFund(code); _pumpFund(); }).catch(()=>{ _fundBusy=false; _curFundCode=null; useDemoFund(code); _pumpFund(); });
    }
  };
  s.onerror=function(){ // 跨域脚本被拦 → 兜底解析/演示
    clearTimeout(timeout); _fundBusy=false; _curFundCode=null;
    const fd=parseFundJs(window.__fundRaw&&window.__fundRaw[code]||'');
    if(fd) applyFundData(code,fd); else { (state.fundFail=state.fundFail||{})[code]=true; useDemoFund(code); } // 东方财富不可达：标记失败，行情看板给出提示而非假数据
    _pumpFund();
  };
  document.body.appendChild(s);
}
function showFundError(code,msg){
  setDataStatus('err','基金获取失败·点重试', ()=>loadFund(code));
  if(state.view==='fund' && state.selected===code){ const det=$('fundDetail'); if(det) det.innerHTML='<div class="empty" style="color:#d22;cursor:pointer;" onclick="loadFund(\''+code+'\')">⚠ '+msg+'</div>'; }
  if(state.view==='fundAnalysis' && state.faCode===code){ const head=$('faHead'); if(head) head.innerHTML='<div class="empty" style="color:#d22;cursor:pointer;" onclick="loadFund(\''+code+'\')">⚠ '+msg+'</div>'; }
}

