/* =========================================================================
 * demo.js
 * 模块来源小节：离线演示数据兜底
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 离线演示数据兜底 ============
   当实时数据源（腾讯/新浪/东方财富）不可达时，用确定性伪随机生成的「演示数据」填充，
   并在状态药丸 + 顶部横幅明确标注，确保页面永不空白、可验证布局。
   联网成功后真实数据会自动顶替演示数据。 */
function codeSeed(code){ let h=2166136261; for(const c of (''+code)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function mulRng(seed){ let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function demoIndex(code){
  const map={
    sh000001:['上证指数',3412.34,-0.42], sz399001:['深证成指',10756.21,0.31],
    sz399006:['创业板指',2189.55,0.88], sh000300:['沪深300',3945.67,-0.15], sh000688:['科创50',962.13,1.12],
    s_usDJI:['道琼斯',54349.12,0.49], s_usIXIC:['纳斯达克',26363.44,-0.83], s_usINX:['标普500',7723.55,-0.17]
  };
  const d=map[code]||[code,3000,0]; const price=d[1], cp=d[2];
  return {code,name:d[0],price,changePct:cp,change:+(price*cp/100).toFixed(2),prevClose:+(price/(1+cp/100)).toFixed(2),open:price,high:+(price*1.005).toFixed(2),low:+(price*0.995).toFixed(2),time:ts()};
}
function demoQuote(code){
  const r=mulRng(codeSeed(code)); const base=+(10+r()*900).toFixed(2);
  const price=+(base*(0.9+r()*0.2)).toFixed(2);
  const prevClose=+(price*(1+(r()-0.5)*0.04)).toFixed(2);
  const changePct=+(((price-prevClose)/prevClose)*100).toFixed(2);
  const vol=Math.floor(r()*1e6+1e4);
  const ask=[],bid=[];
  for(let i=0;i<5;i++){ ask.push([+(price+0.01*(i+1)+r()*0.02).toFixed(2), Math.floor(r()*5000+100)]); }
  for(let i=0;i<5;i++){ bid.push([+(price-0.01*(i+1)-r()*0.02).toFixed(2), Math.floor(r()*5000+100)]); }
  return {code,name:CODE_NAMES[code]||code,price,change:+(price-prevClose).toFixed(2),changePct,prevClose,
    open:+(prevClose*(1+(r()-0.5)*0.01)).toFixed(2),high:+(price*1.01).toFixed(2),low:+(price*0.99).toFixed(2),
    time:ts(),volume:vol,amount:+(vol*price/100).toFixed(0),turnover:+(r()*5).toFixed(2),pe:+(r()*30+5).toFixed(2),
    amplitude:+(r()*3).toFixed(2),mktCap:+(r()*1e4).toFixed(0),pb:+(r()*5+0.5).toFixed(2),
    limitUp:+(prevClose*1.1).toFixed(2),limitDown:+(prevClose*0.9).toFixed(2),ask,bid};
}
function demoKline(code, period){
  const wk = period==='w'; const r=mulRng(codeSeed(code)+(wk?7:0)); const n=130; const out=[];
  let price=+(r()*50+20).toFixed(2); const day=86400000; const step=wk?7:1;
  const start=Date.now()-(n-1)*day*step;
  for(let i=0;i<n;i++){ const open=price; const close=+(price+(r()-0.48)*price*0.03).toFixed(2);
    const high=+(Math.max(open,close)*(1+r()*0.015)).toFixed(2); const low=+(Math.min(open,close)*(1-r()*0.015)).toFixed(2);
    const vol=Math.floor(r()*1e6+1e4); const d=new Date(start+i*step*day);
    const dayStr=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    out.push({date:dayStr,open,high,low,close,vol}); price=close; }
  return out;
}
function demoFund(code){
  const r=mulRng(codeSeed(code)+3); const n=600; const nav=[]; let v=1.0; const day=86400000; const start=Date.now()-(n-1)*day;
  for(let i=0;i<n;i++){ v=+(v*(1+0.0006+(r()-0.5)*0.012)).toFixed(4); nav.push({t:start+i*day, nav:v}); }
  const cum=nav.map(p=>({t:p.t, nav:+(p.nav*(1+(mulRng(codeSeed(code)+9)())*0.1)).toFixed(4)}));
  const latest=nav[nav.length-1].nav, prev=nav[nav.length-2].nav;
  return {nav,cum,latest,prev,name:CODE_NAMES[code]||code};
}
function setDemo(on){
  state.demo=on;
  const b=$('demoBanner'); if(b) b.classList.toggle('show', on);
}
function retryAll(){
  setDataStatus('load','加载中…');
  refreshIndices(); refreshQuotes();
  if(state.view==='fundAnalysis' && state.faCode) loadFund(state.faCode);
}

