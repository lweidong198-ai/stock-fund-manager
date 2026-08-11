/* =========================================================================
 * fundanalysis.js
 * 模块来源小节：基金深度分析（净值统计·风险体检）
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 基金深度分析（净值统计·风险体检） ============ */
function pctile(arr,q){ if(!arr.length) return 0; const s=arr.slice().sort((a,b)=>a-b); const idx=(s.length-1)*q; const lo=Math.floor(idx),hi=Math.ceil(idx); if(lo===hi) return s[lo]; return s[lo]+(s[hi]-s[lo])*(idx-lo); }
function faMonthly(vals, dates){
  const map={};
  for(let i=0;i<vals.length;i++){ const d=new Date(dates[i]); const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!map[k]||dates[i]>map[k].t) map[k]={nav:vals[i],t:dates[i]}; }
  const keys=Object.keys(map).sort();
  const out=[];
  for(let i=1;i<keys.length;i++){ const prev=map[keys[i-1]].nav, cur=map[keys[i]].nav; out.push({key:keys[i], ret:cur/prev-1}); }
  return out;
}
function autocorrLabel(ac){
  if(ac>0.1) return '数值明显为正 → 呈<b>动量效应</b>（涨的后面更可能接着涨，跌的后面更可能接着跌），说明这只基金有"惯性"，适合顺势持有，不适合短线抄底。';
  if(ac<-0.1) return '数值明显为负 → 呈<b>均值回归</b>（涨完了容易回落、跌完了容易反弹），别追涨杀跌，反而可以在跌多的时候考虑买入。';
  return '数值接近 0 → 收益基本<b>随机</b>（昨天的涨跌几乎预测不了今天），短线择时的意义不大，长期持有更省心。';
}
function runFundAnalysis(code, days){
  const fd=state.fundData[code]; if(!fd) return null;
  let nav=fd.nav.slice().sort((a,b)=>a.t-b.t);
  if(nav.length>days) nav=nav.slice(nav.length-days);
  const N=nav.length; if(N<10) return {tooShort:true,N};
  const vals=nav.map(p=>p.nav), dates=nav.map(p=>p.t);
  const rets=[]; for(let i=1;i<N;i++) rets.push(vals[i]/vals[i-1]-1);
  const M=rets.length; const mean=rets.reduce((a,b)=>a+b,0)/M;
  const variance=rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(M-1); const sd=Math.sqrt(variance);
  const annVol=sd*Math.sqrt(252);
  const cumRet=vals[N-1]/vals[0]-1;
  const annRet=Math.pow(1+cumRet, 252/(N-1))-1;
  const annRetArith=mean*252;
  const downDev=Math.sqrt(rets.reduce((a,b)=>a+(b<0?b*b:0),0)/(M-1)); const annDownDev=downDev*Math.sqrt(252);
  let peak=vals[0],peakIdx=0,mdd=0,mddPeak=0,mddTrough=0;
  for(let i=0;i<N;i++){ if(vals[i]>peak){peak=vals[i];peakIdx=i;} const dd=(peak-vals[i])/peak; if(dd>mdd){mdd=dd;mddPeak=peakIdx;mddTrough=i;} }
  let recoveryIdx=-1; const prePeak=vals[mddPeak];
  for(let i=mddTrough+1;i<N;i++){ if(vals[i]>=prePeak){recoveryIdx=i;break;} }
  const recoveryDays=recoveryIdx>=0?(recoveryIdx-mddTrough):null;
  const var95=-pctile(rets,0.05), var99=-pctile(rets,0.01);
  const c95t=pctile(rets,0.05), tail95=rets.filter(r=>r<=c95t); const cvar95loss=-(tail95.reduce((a,b)=>a+b,0)/Math.max(1,tail95.length));
  const c99t=pctile(rets,0.01), tail99=rets.filter(r=>r<=c99t); const cvar99loss=-(tail99.reduce((a,b)=>a+b,0)/Math.max(1,tail99.length));
  const rf=0; const sharpe=annVol>0?(annRetArith-rf)/annVol:0; const calmar=mdd>0?annRet/mdd:0;
  let num=0,den=0; for(let i=1;i<M;i++){ num+=(rets[i]-mean)*(rets[i-1]-mean); den+=(rets[i]-mean)*(rets[i]-mean); } const autocorr=den>0?num/den:0;
  const monthly=faMonthly(vals,dates);
  const W=Math.min(20,N-1); const rolling=[]; for(let i=W;i<N;i++) rolling.push(vals[i]/vals[i-W]-1);
  return {code,name:fd.name||code,N,vals,dates,rets,mean,sd,annVol,cumRet,annRet,annDownDev,mdd,mddPeak,mddTrough,recoveryIdx,recoveryDays,var95,var99,cvar95loss,cvar99loss,sharpe,calmar,autocorr,monthly,rolling,W,days};
}
function renderFundAnalysis(){
  const head=$('faHead'), stats=$('faStats'), disc=$('faDisclaimer');
  if(!state.faCode){
    const f=state.watch.find(w=>w.kind==='fund'); if(f) state.faCode=f.code;
    if(state.faCode && !state.fundData[state.faCode]) loadFund(state.faCode);
  }
  if($('faInput')) $('faInput').value=state.faCode||'';
  if($('faPeriodSel')) $('faPeriodSel').value=state.faPeriod||90;
  if(!state.faCode){ head.innerHTML='<span class="meta">请输入基金代码，点「开始分析」</span>'; stats.innerHTML=''; disc.style.display='none'; return; }
  const fd=state.fundData[state.faCode];
  if(!fd||!fd.nav||!fd.nav.length){
    head.innerHTML='<span class="big">'+state.faCode+'</span><span class="meta">净值加载中…（若长时间无数据，该源可能需要本地服务器环境）</span>';
    if(!state.faLoading){ state.faLoading=true; loadFund(state.faCode); }
    stats.innerHTML=''; disc.style.display='none'; return;
  }
  state.faLoading=false; disc.style.display='block';
  const days=state.faPeriod||90; const A=runFundAnalysis(state.faCode,days);
  if(!A){ head.innerHTML='<span class="meta">数据不足</span>'; return; }
  if(A.tooShort){ head.innerHTML='<span class="big">'+A.name+'</span><span class="meta">'+state.faCode+'</span>'; stats.innerHTML='<div class="empty">净值数据不足（需≥10条），无法分析</div>'; return; }
  head.innerHTML='<span class="big">'+A.name+'</span><span class="meta">'+state.faCode+' · 近'+days+'天（'+A.N+'条净值）</span>'
    +'<span class="meta" style="margin-left:auto;">区间收益 <b class="'+(cls(A.cumRet))+'">'+pct(A.cumRet*100)+'</b></span>';
  const riskC='flat';
  stats.innerHTML=[
    ['区间收益', pct(A.cumRet*100), cls(A.cumRet)],
    ['年化收益', pct(A.annRet*100), cls(A.annRet)],
    ['年化波动率', (A.annVol*100).toFixed(2)+'%', riskC],
    ['下行波动率', (A.annDownDev*100).toFixed(2)+'%', riskC],
    ['最大回撤', (A.mdd*100).toFixed(2)+'%', riskC],
    ['夏普比率', A.sharpe.toFixed(2), cls(A.sharpe)],
    ['卡玛比率', A.calmar.toFixed(2), cls(A.calmar)],
    ['VaR(95%)', (A.var95*100).toFixed(2)+'%', riskC],
    ['CVaR(95%)', (A.cvar95loss*100).toFixed(2)+'%', riskC]
  ].map(r=>'<div class="stat"><div class="k" title="'+{区间收益:'这段时间总共涨/跌了多少',年化收益:'按这段时间的表现折算成一年涨多少',年化波动率:'净值上下波动的剧烈程度，越大越颠',下行波动率:'只看下跌那部分有多剧烈',最大回撤:'从最高点跌到最低点，最多亏了多少',夏普比率:'每承担1份风险能换多少收益（越高越好）',卡玛比率:'收益除以最大回撤（越高越好）','VaR(95%)':'95%的情况下，一天最多亏多少','CVaR(95%)':'最坏5%那天的平均亏损有多少'}[r[0]]+'">'+r[0]+'</div><div class="v '+r[2]+'">'+r[1]+'</div></div>').join('');
  drawFundNav('faNavCanvas',A); syncVP($('faNavCanvas'),['faGrowthCanvas','faDDCanvas'],A.vals.length); drawFundGrowth('faGrowthCanvas',A); drawFundDD('faDDCanvas',A);
  $('faDDText').innerHTML='这段时间里，最大回撤（就是从最高点跌到最低点、亏得最多的那一段）是 <b class="down">'+(A.mdd*100).toFixed(2)+'%</b>。'
    +'具体来说：'+new Date(A.dates[A.mddPeak]).toLocaleDateString('zh-CN')+' 涨到最高点，然后一路跌到 '+new Date(A.dates[A.mddTrough]).toLocaleDateString('zh-CN')+' 的最低点。'
    +(A.recoveryDays!=null?' 之后用了约 <b>'+A.recoveryDays+' 个交易日</b>才涨回前高（如果你当时没卖、一直拿着，要熬这么久才能"回本"）。':' 截至这段数据结束，<b>还没涨回</b>前高，仍在修复中。');
  drawFundHeat('faHeatCanvas',A); drawFundRoll('faRollCanvas',A);
  $('faAutoStats').innerHTML='<div class="stat"><div class="k">一阶自相关系数</div><div class="v">'+A.autocorr.toFixed(3)+'</div></div>';
  $('faAutoText').innerHTML='自相关系数 = '+A.autocorr.toFixed(3)+'（就是"今天涨了，明天接着涨"的概率有多大：正数=有惯性，负数=涨完容易回落）。'+autocorrLabel(A.autocorr);
}
function drawFundNav(id,A){ const cv=$(id); cv._A=A; const {ctx,w,h}=setup(cv); ensureVP(cv,A.vals.length);
  const vp=cv._vp; const start=vp.start, count=vp.count; const vals=A.vals.slice(start,start+count), dates=A.dates.slice(start,start+count);
  let lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals); const pad=(hi-lo)*0.1||1; lo-=pad;hi+=pad; const n=vals.length,cw=w-54; const X=i=>(i+0.5)*(cw/n); const Y=v=>h-18-(v-lo)/(hi-lo)*(h-34);
  cv._n=n; cv._cw=cw; cv._redraw=()=>drawFundNav(id,A);
  ctx.strokeStyle=GRID; ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
  for(let g=0;g<=4;g++){ const p=lo+(hi-lo)*g/4,y=Y(p); ctx.beginPath();ctx.moveTo(6,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(p,3),cw+4,y+3); }
  ctx.strokeStyle='#f5811f'; ctx.lineWidth=1.6; ctx.beginPath(); for(let i=0;i<n;i++){const x=X(i),y=Y(vals[i]); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  drawDateAxis(ctx, dates, A.vals.length, X, h-4, cw);
  drawFaHover(cv,ctx,X,Y,cw,h,vals, i=>[new Date(dates[i]).toLocaleDateString('zh-CN'),'净值 '+fmt(vals[i],4)], '#f5811f');
}
function drawFundGrowth(id,A){ const cv=$(id); cv._A=A; const {ctx,w,h}=setup(cv); ensureVP(cv,A.vals.length);
  const vp=cv._vp; const start=vp.start, count=vp.count; const subVals=A.vals.slice(start,start+count), dates=A.dates.slice(start,start+count); const base=subVals[0]; const g=subVals.map(v=>100*v/base);
  let lo=Math.min.apply(null,g),hi=Math.max.apply(null,g); const pad=(hi-lo)*0.1||1; lo-=pad;hi+=pad; const n=g.length,cw=w-54; const X=i=>(i+0.5)*(cw/n); const Y=v=>h-18-(v-lo)/(hi-lo)*(h-34);
  cv._n=n; cv._cw=cw; cv._redraw=()=>drawFundGrowth(id,A);
  ctx.strokeStyle=GRID; ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
  for(let q=0;q<=4;q++){ const p=lo+(hi-lo)*q/4,y=Y(p); ctx.beginPath();ctx.moveTo(6,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(p,1),cw+4,y+3); }
  ctx.strokeStyle='#2563eb'; ctx.lineWidth=1.6; ctx.beginPath(); for(let i=0;i<n;i++){const x=X(i),y=Y(g[i]); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  drawDateAxis(ctx, dates, A.vals.length, X, h-4, cw);
  drawFaHover(cv,ctx,X,Y,cw,h,g, i=>[new Date(dates[i]).toLocaleDateString('zh-CN'),'本金100→'+fmt(g[i],1),'收益 '+(g[i]-100).toFixed(1)+'%'], '#2563eb');
}
function drawFundDD(id,A){ const cv=$(id); cv._A=A; const {ctx,w,h}=setup(cv); ensureVP(cv,A.vals.length);
  const vp=cv._vp; const start=vp.start, count=vp.count; const vals=A.vals.slice(start,start+count), dates=A.dates.slice(start,start+count);
  const dd=[]; let pk=vals[0], peakIdx=0, mdd=0, mddPeak=0, mddTrough=0;
  for(let i=0;i<vals.length;i++){ if(vals[i]>pk){pk=vals[i];peakIdx=i;} const d=(pk-vals[i])/pk; dd.push(-d*100); if(d>mdd){mdd=d;mddPeak=peakIdx;mddTrough=i;} }
  let lo=Math.min.apply(null,dd.concat(0)),hi=0; const pad=(hi-lo)*0.1||1; lo-=pad; const n=dd.length,cw=w-54; const X=i=>(i+0.5)*(cw/n); const Y=v=>h-18-(v-lo)/(hi-lo)*(h-34);
  cv._n=n; cv._cw=cw; cv._redraw=()=>drawFundDD(id,A);
  ctx.strokeStyle=GRID; ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
  for(let q=0;q<=4;q++){ const p=lo+(hi-lo)*q/4,y=Y(p); ctx.beginPath();ctx.moveTo(6,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(p,1)+'%',cw+4,y+3); }
  if(mddTrough>mddPeak){ ctx.fillStyle='rgba(15,157,88,0.14)'; ctx.fillRect(X(mddPeak),0,X(mddTrough)-X(mddPeak),h); }
  ctx.fillStyle=DOWN; ctx.beginPath(); ctx.moveTo(X(0),Y(0)); for(let i=0;i<n;i++) ctx.lineTo(X(i),Y(dd[i])); ctx.lineTo(X(n-1),Y(0)); ctx.closePath(); ctx.globalAlpha=.9; ctx.fill(); ctx.globalAlpha=1;
  ctx.strokeStyle=DOWN; ctx.lineWidth=1.3; ctx.beginPath(); for(let i=0;i<n;i++){const x=X(i),y=Y(dd[i]); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  drawDateAxis(ctx, dates, A.vals.length, X, h-4, cw);
  drawFaHover(cv,ctx,X,Y,cw,h,dd, i=>[new Date(dates[i]).toLocaleDateString('zh-CN'),'回撤 '+dd[i].toFixed(2)+'%'], DOWN);
}
function drawFundHeat(id,A){ const cv=$(id); cv._A=A; cv._redraw=()=>drawFundHeat(id,A); const {ctx,w,h}=setup(cv); const m=A.monthly; if(!m.length){ cv._n=0; ctx.fillStyle=FLAT; ctx.font='12px sans-serif'; ctx.fillText('暂无月度数据',12,20); return; }
  const allYears=[]; const map={}; m.forEach(x=>{ const y=x.key.slice(0,4); if(!map[y]){map[y]=[];allYears.push(y);} map[y].push(x); });
  allYears.sort();
  if(cv._heatYears==null || cv._heatYears<1) cv._heatYears=Math.min(3,allYears.length);
  const maxYears=allYears.length; if(cv._heatYears>maxYears) cv._heatYears=maxYears;
  const years=allYears.slice(maxYears-cv._heatYears);
  const cellH=Math.min(32,(h-26)/Math.max(1,years.length)); const cellW=(w-46)/12; const x0=46,y0=18;
  ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='center';
  for(let mo=1;mo<=12;mo++) ctx.fillText(mo+'月', x0+(mo-0.5)*cellW, y0-6);
  const visible=m.filter(x=>years.includes(x.key.slice(0,4)));
  const maxAbs=Math.max(0.0001, ...visible.map(x=>Math.abs(x.ret)));
  for(let yi=0;yi<years.length;yi++){ const y=years[yi]; ctx.textAlign='right'; ctx.fillStyle=FLAT; ctx.fillText(y, x0-6, y0+yi*cellH+cellH/2+3); ctx.textAlign='center';
    const mm={}; map[y].forEach(x=>mm[parseInt(x.key.slice(5),10)]=x.ret);
    for(let mo=1;mo<=12;mo++){ const cx=x0+(mo-1)*cellW, cy=y0+yi*cellH; const ret=mm[mo];
      if(ret==null){ ctx.fillStyle='#f3f5f9'; } else { const inten=Math.min(1,Math.abs(ret)/maxAbs); const c=ret>=0?'239,47,58':'15,157,88'; ctx.fillStyle='rgba('+c+','+(0.2+0.8*inten)+')'; }
      ctx.fillRect(cx+1,cy+1,cellW-2,cellH-2);
      if(ret!=null){ ctx.fillStyle=Math.abs(ret)/maxAbs>0.5?'#fff':'#1f2937'; ctx.font='9px sans-serif'; ctx.fillText((ret>=0?'+':'')+(ret*100).toFixed(1), cx+cellW/2, cy+cellH/2+3); }
    }
  }
  // 提示
  ctx.textAlign='left'; ctx.font='10px sans-serif'; ctx.fillStyle=FLAT; ctx.fillText('最近'+cv._heatYears+'年 · 上下拖动改变', 4, 12);
  cv._hx0=x0; cv._hy0=y0; cv._hcellW=cellW; cv._hcellH=cellH; cv._hyears=years; cv._hmap=map; cv._n=m.length;
  if(cv._hover){ const yi=cv._hover[0], mo=cv._hover[1]; const cx=x0+(mo-1)*cellW, cy=y0+yi*cellH; ctx.strokeStyle='#3a4250'; ctx.lineWidth=2; ctx.strokeRect(cx+1,cy+1,cellW-2,cellH-2); const y=years[yi]; const key=y+'-'+String(mo).padStart(2,'0'); const it=map[y]?map[y].find(x=>x.key===key):null; drawTooltip(ctx, cx+cellW/2, cy+cellH/2, [y+'年'+mo+'月', it?(it.ret>=0?'+':'')+(it.ret*100).toFixed(1)+'%':'无数据']); }
  // 绑定上下拖动
  if(!cv._heatBound){ cv._heatBound=1;
    let lastY=0,dragging=false;
    cv.addEventListener('mousedown',e=>{ if(e.button!==0) return; dragging=true; lastY=e.clientY; cv.style.cursor='ns-resize'; });
    window.addEventListener('mousemove',e=>{ if(!dragging) return; const dy=e.clientY-lastY; if(Math.abs(dy)>20){ if(dy>0 && cv._heatYears<maxYears) cv._heatYears++; else if(dy<0 && cv._heatYears>1) cv._heatYears--; lastY=e.clientY; cv._redraw&&cv._redraw(); } });
    window.addEventListener('mouseup',()=>{ dragging=false; cv.style.cursor='crosshair'; });
    cv.addEventListener('touchstart',e=>{ if(e.touches.length===1){ lastY=e.touches[0].clientY; dragging=true; } },{passive:false});
    cv.addEventListener('touchmove',e=>{ if(!dragging||e.touches.length!==1) return; e.preventDefault(); const dy=e.touches[0].clientY-lastY; if(Math.abs(dy)>20){ if(dy>0 && cv._heatYears<maxYears) cv._heatYears++; else if(dy<0 && cv._heatYears>1) cv._heatYears--; lastY=e.touches[0].clientY; cv._redraw&&cv._redraw(); } },{passive:false});
    cv.addEventListener('touchend',()=>{ dragging=false; });
  }
}
function drawFundRoll(id,A){ const cv=$(id); cv._A=A; const r=A.rolling; if(!r.length){ const {ctx}=setup(cv); cv._n=0; ctx.fillStyle=FLAT; ctx.font='12px sans-serif'; ctx.fillText('数据不足',12,20); return; }
  cv._dataLen=r.length; ensureVP(cv,r.length);
  cv._n=r.length; cv._cw=cv.clientWidth-46; cv._redraw=()=>drawFundRoll(id,A); drawLinePane(id,[{data:r.map(x=>x*100),color:'#2563eb'}],{guides:[0],legend:[{label:'滚动'+A.W+'日收益%',color:'#2563eb'}],hoverDates:A.dates.slice(A.W)});
}
function drawTooltip(ctx,x,y,lines){ if(!lines||!lines.length) return; ctx.save(); ctx.font='11px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic'; const padX=8,padY=6,lh=15; let bw=0; lines.forEach(s=>{const w=ctx.measureText(s).width; if(w>bw)bw=w;}); bw+=padX*2; const bh=lines.length*lh+padY*2-2; let bx=x+12; const W=ctx.canvas.clientWidth; if(bx+bw>W-2) bx=x-bw-12; if(bx<2)bx=2; let by=y-bh-10; if(by<2) by=y+12; ctx.fillStyle='rgba(255,255,255,0.97)'; ctx.strokeStyle='#3a4250'; ctx.lineWidth=1; ctx.beginPath(); ctx.rect(bx,by,bw,bh); ctx.fill(); ctx.stroke(); ctx.fillStyle='#3a4250'; lines.forEach((s,k)=>ctx.fillText(s,bx+padX,by+padY+lh*(k+0.5))); ctx.restore(); }
function drawFaHover(cv,ctx,X,Y,cw,h,valueArr,textFn,color){ if(cv._hover==null) return; const i=cv._hover; if(i<0||i>=valueArr.length) return; const x=X(i), y=Y(valueArr[i]); ctx.save(); ctx.strokeStyle='#94a3b8'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h-14); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke(); ctx.restore(); drawTooltip(ctx,x,y,textFn(i)); }
function bindFaHover(){ [['faNavCanvas'],['faGrowthCanvas'],['faDDCanvas'],['faRollCanvas']].forEach(([id],idx)=>{ const cv=$(id); if(cv._hb) return; cv._hb=1;
  if(id==='faNavCanvas') bindPanZoom(cv,()=>cv._A?cv._A.vals.length:0,()=>{ if(cv._redraw){ syncVP(cv,['faGrowthCanvas','faDDCanvas'],cv._A.vals.length); cv._redraw(); } });
  if(id==='faRollCanvas') bindPanZoom(cv,()=>cv._dataLen||(cv._A?cv._A.vals.length:0),()=>{ if(cv._redraw) cv._redraw(); });
  cv.addEventListener('mousemove',e=>{ if(cv._dragging){ cv._hover=null; return; } const A=cv._A; if(!A||!cv._n) return; const rect=cv.getBoundingClientRect(); const x=e.clientX-rect.left-(cv._padLx||0); let i=Math.floor(x/(cv._cw/cv._n)); i=Math.max(0,Math.min(cv._n-1,i)); if(cv._hover!==i){ cv._hover=i; if(cv._redraw) cv._redraw(); } });
  cv.addEventListener('mouseleave',()=>{ if(cv._hover!=null){ cv._hover=null; if(cv._redraw) cv._redraw(); } });
}); const hc=$('faHeatCanvas'); if(!hc._hb){ hc._hb=1; hc.addEventListener('mousemove',e=>{ if(hc._dragging){ hc._hover=null; return; } const A=hc._A; if(!A||!A.monthly||!A.monthly.length) return; const mx=e.offsetX,my=e.offsetY; if(mx<hc._hx0||mx>hc._hx0+12*hc._hcellW||my<hc._hy0||my>hc._hy0+hc._hyears.length*hc._hcellH){ if(hc._hover){hc._hover=null;hc._redraw&&hc._redraw();} return; } const mo=Math.floor((mx-hc._hx0)/hc._hcellW)+1; const yi=Math.floor((my-hc._hy0)/hc._hcellH); if(yi<0||yi>=hc._hyears.length||mo<1||mo>12){ if(hc._hover){hc._hover=null;hc._redraw&&hc._redraw();} return; } const key=hc._hyears[yi]+'-'+String(mo).padStart(2,'0'); const has=hc._hmap[hc._hyears[yi]]&&hc._hmap[hc._hyears[yi]].some(x=>x.key===key); if(!has){ if(hc._hover){hc._hover=null;hc._redraw&&hc._redraw();} return; } if(!hc._hover||hc._hover[0]!==yi||hc._hover[1]!==mo){ hc._hover=[yi,mo]; hc._redraw&&hc._redraw(); } }); hc.addEventListener('mouseleave',()=>{ if(hc._hover){hc._hover=null;hc._redraw&&hc._redraw();} }); } }

/* 基金深度分析：交互 */
$('btnFaStart').onclick=()=>{ const v=$('faInput').value.trim(); if(!/^\d{6}$/.test(v)){ alert('请输入6位基金代码，如 000001'); return; } state.faCode=v; state.faLoading=false; $('faPeriodSel').value=state.faPeriod||90; if(!state.fundData[v]) loadFund(v); else renderFundAnalysis(); };
$('faPeriodSel').onchange=()=>{ state.faPeriod=parseInt($('faPeriodSel').value,10)||90; if(state.faCode) renderFundAnalysis(); };

