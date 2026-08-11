/* =========================================================================
 * charts.js
 * 模块来源小节：绘制主图（蜡烛+MA+BOLL+量） / 通用副图（指标） / 基金净值图
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 绘制主图（蜡烛+MA+BOLL+量） ============ */
function drawMain(kl){
  const cv=$('klineMain'); cv._kl=kl; const {ctx,w,h}=setup(cv);
  try{
    if(!kl||!kl.length){ ctx.fillStyle=FLAT; ctx.font='13px sans-serif'; ctx.fillText('暂无数据',12,20); return; }
    ensureVP(cv,kl.length);
    const vp=cv._vp; const start=vp.start, count=vp.count; const sub=kl.slice(start,start+count);
    const padR=CHART_PADR, padL=CHART_PADL, volH=78, gap=8, cw=w-padR;
    const priceH=h-volH-gap-18;
    // 成交量区域分隔线
    const volTop=h-volH-gap+4;
    ctx.strokeStyle='#dde3ec'; ctx.lineWidth=1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(padL,volTop); ctx.lineTo(cw,volTop); ctx.stroke();
    const highs=sub.map(x=>x.high), lows=sub.map(x=>x.low);
    const ind=state.ind;
    const closesAll=kl.map(x=>x.close);
    const subCloses=sub.map(x=>x.close);
    const ma5=sma(closesAll,5).slice(start,start+count), ma10=sma(closesAll,10).slice(start,start+count), ma20=sma(closesAll,20).slice(start,start+count), ma60=sma(closesAll,60).slice(start,start+count);
    const b=boll(closesAll,20); let bMid=b.mid.slice(start,start+count), bUp=b.up.slice(start,start+count), bLow=b.low.slice(start,start+count);
    let lo=Math.min(...lows), hi=Math.max(...highs);
    // BOLL 轨道纳入价格区间时先做合理性钳制：跨度极大的周线（如茅台 17→2500）标准差爆炸，
    // 下轨会被算成负数、上轨被算成天文数字，反过来把真实K线压成「一条线」。
    // 轨道只作为参考线，不该拉爆主图坐标，故不在 [lo,hi] 之外（允许贴边，最多超出当前区间 2%）。
    if(ind.boll){
      const bandLo=Math.min(...lows)*0.98, bandHi=Math.max(...highs)*1.02;
      const cl=v=>(v==null||!isFinite(v))?null:Math.max(bandLo,Math.min(bandHi,v));
      bUp=bUp.map(cl); bLow=bLow.map(cl); bMid=bMid.map(cl);   // 钳制值同时用于绘制，避免线画到画布外
      lo=Math.min(lo,...bLow.filter(x=>x!=null)); hi=Math.max(hi,...bUp.filter(x=>x!=null));
    }
    // 持仓成本/止盈/止损参考线：纳入价格区间，保证虚线可见
    const _hl = state.hold.find(x=>x.code===state.selected);
    const _lines = [];
    if(_hl){
      if(_hl.cost>0)  _lines.push({p:_hl.cost,  color:'#e0a000', text:'成本 '+fmt(_hl.cost,2)});
      if(_hl.target>0)_lines.push({p:_hl.target,color:'#e01f22', text:'止盈 '+fmt(_hl.target,2)});
      if(_hl.stop>0)  _lines.push({p:_hl.stop,  color:'#0f9d58', text:'止损 '+fmt(_hl.stop,2)});
      // 参考线纳入区间同样要钳制：止盈/止损若填错（多打一个0）会把坐标拉爆、K线压扁。
      // 超出真实价格区间 ±30% 的参考线只贴边显示（标签仍写真实价格，不误导）。
      const rLo=Math.min(...lows), rHi=Math.max(...highs), rR=(rHi-rLo)||rHi*0.1||1;
      const gLo=rLo-rR*0.3, gHi=rHi+rR*0.3;
      _lines.forEach(L=>{ const p=Math.max(gLo,Math.min(gHi,L.p)); L.py=p; if(p<lo) lo=p; if(p>hi) hi=p; });
    }
    // 留白：上下各留约 2% 余量，避免最高/最低蜡烛贴边被裁掉。
    // 必须用「相对当前价格的比例」，不能用「全区间百分比」——否则跨度极大的区间
    // (茅台周线 17→2500)底部 6% 余量≈150 会把 lo 从 17 减成 0/负数，坐标轴出现 0/负刻度、
    // 早期蜡烛被压到贴底边，退化成「一条线」（即便 lo 不为负，轴底显示 0.00 也失真）。
    lo = Math.max(0, lo * 0.98);
    hi = hi * 1.02;
    const n=sub.length, bw=Math.max(2,cw/n*0.62);
    const X=i=> padL + (i+0.5)*(cw/n);
    const Y=p=> priceH - (p-lo)/(hi-lo)*priceH;
    const volMax=Math.max(...sub.map(x=>x.vol),1);
    const Yv=v=> h - (v/volMax)*volH;
    ctx.strokeStyle='#e3e8ef'; ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
    for(let g=0;g<=4;g++){ const p=lo+(hi-lo)*g/4; const y=Y(p); ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(p,2), cw+4, y+3); }
    for(let i=0;i<n;i++){ const x=X(i); const k=sub[i]; const up=k.close>=k.open; const col=up?UP:DOWN;
      ctx.strokeStyle=col; ctx.fillStyle=col;
      ctx.beginPath(); ctx.moveTo(x,Y(k.high)); ctx.lineTo(x,Y(k.low)); ctx.stroke();
      const yO=Y(k.open),yC=Y(k.close); const top=Math.min(yO,yC); const hh=Math.max(1,Math.abs(yC-yO));
      ctx.fillRect(x-bw/2,top,bw,hh);
      // 成交量柱（全不透明+区分涨跌色）
      const vy=Yv(k.vol); ctx.fillStyle=up?'rgba(224,31,34,0.55)':'rgba(15,157,88,0.55)';
      ctx.fillRect(x-bw/2, vy, bw, h-vy);
    }
    function line(arr,color){ ctx.strokeStyle=color; ctx.lineWidth=1.2; ctx.beginPath(); let started=false;
      for(let i=0;i<n;i++){ if(arr[i]==null){started=false;continue;} const x=X(i),y=Y(arr[i]); if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);} ctx.stroke(); }
    if(ind.ma){ line(ma5,'#d99a00'); line(ma10,'#2b7de9'); line(ma20,'#d651a8'); line(ma60,'#7a52d6'); }
    if(ind.boll){ line(bMid,'#3a6ea5'); line(bUp,'#3a6ea5'); line(bLow,'#3a6ea5'); }
    const last=subCloses[n-1]; const ly=Y(last); ctx.setLineDash([3,3]); ctx.strokeStyle=FLAT;
    ctx.beginPath();ctx.moveTo(padL,ly);ctx.lineTo(cw,ly);ctx.stroke(); ctx.setLineDash([]);
    // 持仓参考线（成本/止盈/止损）+ 触及/回本提示
    _lines.forEach(L=>{ const y=Y(L.py!=null?L.py:L.p); const off=(L.py!=null && Math.abs(L.py-L.p)>1e-6); ctx.setLineDash([5,4]); ctx.strokeStyle=L.color; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(cw,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=L.color; ctx.font='10px sans-serif'; ctx.textAlign='left'; ctx.fillText(L.text+(off?(L.p>L.py?' ↑超出图外':' ↓超出图外'):''), padL+4, y-3); });
    if(_hl){ const cur=priceOf(state.selected); if(cur>0){ let badge='', bcol='';
      if(_hl.target>0 && cur>=_hl.target){ badge='现价已触及止盈线 ✔'; bcol='#e01f22'; }
      else if(_hl.stop>0 && cur<=_hl.stop){ badge='现价已触及止损线 ⚠'; bcol='#0f9d58'; }
      else if(_hl.cost>0 && cur<_hl.cost){ badge='浮亏中 · 回本需涨 +'+((( _hl.cost-cur)/cur)*100).toFixed(2)+'%'; bcol='#e0a000'; }
      if(badge){ ctx.fillStyle=bcol; ctx.font='bold 11px sans-serif'; ctx.textAlign='left'; ctx.fillText(badge, padL+4, 13); } } }
    ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
    ctx.fillText('量(万)', padL, h-2);
    ctx.fillText(fmtVol(volMax), cw+4, h-2);
    // 日期轴：居中、避免最左被截断；根据数据跨度智能显示年月/月日
    ctx.textAlign='center';
    const dateTicks = n<=20?5: n<=60?4:3;
    for(let g=0;g<dateTicks;g++){
      const i=Math.floor((n-1)*g/(dateTicks-1));
      if(sub[i]){
        const label=smartDateLabel(sub[i].date, kl.length);
        const tx=X(i);
        // 最左/最右留边距，避免截断
        const lx=Math.max(ctx.measureText(label).width/2+2, Math.min(cw-ctx.measureText(label).width/2-2, tx));
        ctx.fillText(label, lx, h-volH-gap+12);
      }
    }
    ctx.textAlign='left';
    // 悬停十字线（竖线贯穿到画布底部，与下方 MACD/KDJ/RSI 副图连成一条）
    if(cv._hover!=null){ const i=cv._hover-start; if(i>=0&&i<n){ const k=sub[i], x=X(i), col=k.close>=k.open?UP:DOWN;
      ctx.save(); ctx.strokeStyle='#94a3b8'; ctx.setLineDash([3,3]); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL,Y(k.close)); ctx.lineTo(cw,Y(k.close)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,Y(k.close),3.5,0,Math.PI*2); ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke();
      ctx.restore();
      drawTooltip(ctx,x,Y(k.close),[k.date,'开 '+fmt(k.open,2),'高 '+fmt(k.high,2),'低 '+fmt(k.low,2),'收 '+fmt(k.close,2),(k.close>=k.open?'↑':'↓')+' '+(k.open?((k.close-k.open)/k.open*100).toFixed(2):'0')+'%','量 '+fmtVol(k.vol)]);
    }}
    cv._x=X; cv._y=Y; cv._padL=padL; cv._cw=cw; cv._priceH=priceH; cv._lo=lo; cv._hi=hi;
  }catch(e){
    ctx.fillStyle='#e01f22'; ctx.font='12px sans-serif'; ctx.textAlign='left';
    ctx.fillText('K线图绘制出错：', 12, 22);
    ctx.fillStyle=FLAT; ctx.fillText(String(e&&e.message?e.message:e).slice(0,120), 12, 40);
    console.error('drawMain error', e);
    chartStat('K线图绘制出错：'+(e&&e.message?e.message:e)+'\n（版本 '+APP_VER+'，请截图反馈）', 'err');
  }
}


/* ============ 通用副图（指标） ============ */
function drawLinePane(cvId, series, opts){
  const cv=$(cvId); const {ctx,w,h}=setup(cv);
  try{
    if(!series.length || series.every(s=>!s.data||s.data.every(v=>v==null))){ ctx.fillStyle=FLAT; ctx.font='12px sans-serif'; ctx.fillText('暂无',12,20); return; }
    const N=series[0].data.length; ensureVP(cv,N);
    const vp=cv._vp; const start=vp.start, count=vp.count;
    const subSeries=series.map(s=>({...s,data:s.data.slice(start,start+count)}));
    let lo=Infinity,hi=-Infinity; const n=subSeries[0].data.length;
    subSeries.forEach(s=>s.data.forEach(v=>{ if(v!=null){ if(v<lo)lo=v; if(v>hi)hi=v; }}));
    if(opts.guides){ opts.guides.forEach(g=>{ if(g<lo)lo=g; if(g>hi)hi=g; }); }
    const pad=(hi-lo)*0.1||1; lo-=pad; hi+=pad;
    // 坐标系与主图 drawMain 完全一致（padL/padR 相同），确保十字线跨图严格对齐
    const padR=CHART_PADR, padL=CHART_PADL, cw=w-padR; const X=i=> padL+(i+0.5)*(cw/n); const Y=v=> h-8-(v-lo)/(hi-lo)*(h-16);
    // 当前光标索引（全局索引）：优先用主图传来的 crossIdx，其次用自身 _hover
    const _ci = (opts.crossIdx!=null) ? opts.crossIdx : cv._hover;
    const _on = (_ci!=null && _ci>=start && _ci<start+count);
    const _ix = _on ? (_ci-start) : -1;
    ctx.strokeStyle='#e3e8ef'; ctx.fillStyle=FLAT; ctx.font='10px sans-serif';
    for(let g=0;g<=2;g++){ const v=lo+(hi-lo)*g/2; const y=Y(v); ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(v,1),cw+4,y+3); }
    if(opts.guides){ opts.guides.forEach(g=>{ const y=Y(g); ctx.strokeStyle='#c7cfdb'; ctx.setLineDash([2,2]); ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle=FLAT; ctx.fillText(String(g),cw+4,y+3); }); }
    subSeries.forEach(s=>{
      if(s.type==='bar'){ const bw=Math.max(1.5,cw/n*0.5);
        for(let i=0;i<n;i++){ const v=s.data[i]; if(v==null)continue; const x=X(i); const y0=Y(0), y=Y(v);
          ctx.fillStyle = v>=0?UP:DOWN; ctx.fillRect(x-bw/2, Math.min(y0,y), bw, Math.abs(y-y0)); }
      }else{ ctx.strokeStyle=s.color; ctx.lineWidth=1.3; ctx.beginPath(); let st=false;
        for(let i=0;i<n;i++){ const v=s.data[i]; if(v==null){st=false;continue;} const x=X(i),y=Y(v); if(!st){ctx.moveTo(x,y);st=true;}else ctx.lineTo(x,y);} ctx.stroke(); }
    });
    // 图例：光标悬停时追加当前值（专业看盘软件做法，数值跟着光标走）
    if(opts.legend){ ctx.font='10px sans-serif'; ctx.textAlign='left'; let lx=padL;
      opts.legend.forEach((l,li)=>{
        let txt=l.label;
        if(_on){ const s=subSeries[l.si!=null?l.si:li]; const v=s?s.data[_ix]:null; if(v!=null) txt=l.label+' '+fmt(v,2); }
        ctx.fillStyle=l.color; ctx.fillText(txt, lx, 12); lx+=ctx.measureText(txt).width+10;
      });
    }
    // 贯穿十字线：竖线从画布顶到底，与主图/其他副图连成一条；各条曲线在该位置点亮圆点
    if(_on){
      const x=X(_ix);
      ctx.save(); ctx.strokeStyle='#94a3b8'; ctx.setLineDash([3,3]); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); ctx.setLineDash([]);
      subSeries.forEach(s=>{ if(s.type==='bar') return; const v=s.data[_ix]; if(v==null) return;
        ctx.fillStyle=s.color||'#2563eb'; ctx.beginPath(); ctx.arc(x,Y(v),3,0,Math.PI*2); ctx.fill();
        ctx.lineWidth=1.2; ctx.strokeStyle='#fff'; ctx.stroke(); });
      ctx.restore();
      // 基金滚动收益图等场景：保留原有气泡提示
      if(opts.hoverDates && opts.hoverDates[_ci]!=null && subSeries[0].data[_ix]!=null){
        drawTooltip(ctx,x,Y(subSeries[0].data[_ix]),[new Date(opts.hoverDates[_ci]).toLocaleDateString('zh-CN'),'收益 '+fmt(subSeries[0].data[_ix],2)+'%']);
      }
    }
    cv._x=X; cv._y=Y; cv._cw=cw; cv._padLx=padL;
  }catch(e){
    ctx.fillStyle='#e01f22'; ctx.font='12px sans-serif'; ctx.textAlign='left';
    ctx.fillText('指标图绘制出错：', 10, 18);
    ctx.fillStyle=FLAT; ctx.fillText(String(e&&e.message?e.message:e).slice(0,120), 10, 34);
    console.error('drawLinePane error', cvId, e);
  }
}


/* ============ 基金净值图 ============ */
function drawNav(canvasId, fd){
  const cv=$(canvasId); cv._fd=fd; const {ctx,w,h}=setup(cv);
  const nav=fd.nav;
  if(!nav||!nav.length){ ctx.fillStyle=FLAT; ctx.font='13px sans-serif'; ctx.fillText('暂无净值',12,20); return; }
  ensureVP(cv,nav.length);
  const vp=cv._vp; const start=vp.start, count=vp.count; const sub=nav.slice(start,start+count);
  const vals=sub.map(p=>p.nav); let lo=Math.min(...vals),hi=Math.max(...vals);
  // 持仓成本/止盈/止损参考线（基金：成本为每份额成本）：纳入区间，保证可见
  const _hl=state.hold.find(x=>x.code===state.selected);
  const _lines=[];
  if(_hl){
    if(_hl.cost>0)  _lines.push({p:_hl.cost,  color:'#e0a000', text:'成本 '+fmt(_hl.cost,4)});
    if(_hl.target>0)_lines.push({p:_hl.target,color:'#e01f22', text:'止盈 '+fmt(_hl.target,4)});
    if(_hl.stop>0)  _lines.push({p:_hl.stop,  color:'#0f9d58', text:'止损 '+fmt(_hl.stop,4)});
    // 与主图同理：参考线填错(多打一个0)不得拉爆坐标把净值曲线压成一条线，超出 ±30% 只贴边
    const rLo=Math.min(...vals), rHi=Math.max(...vals), rR=(rHi-rLo)||rHi*0.1||1;
    const gLo=rLo-rR*0.3, gHi=rHi+rR*0.3;
    _lines.forEach(L=>{ const p=Math.max(gLo,Math.min(gHi,L.p)); L.py=p; if(p<lo) lo=p; if(p>hi) hi=p; });
  }
  // 留白：上下各 2% 比例余量（同主图，避免底部被减穿成 0/负数刻度）
  lo = Math.max(0, lo * 0.98);
  hi = hi * 1.02;
  const n=sub.length, cw=w-58; const X=i=>(i+0.5)*(cw/n); const Y=v=>h-20-(v-lo)/(hi-lo)*(h-40);
  ctx.strokeStyle='#e3e8ef'; ctx.fillStyle=FLAT; ctx.font='10px sans-serif'; ctx.textAlign='left';
  for(let g=0;g<=4;g++){ const p=lo+(hi-lo)*g/4,y=Y(p); ctx.beginPath();ctx.moveTo(8,y);ctx.lineTo(cw,y);ctx.stroke(); ctx.fillText(fmt(p,3),cw+4,y+3); }
  ctx.strokeStyle='#2b7de9'; ctx.lineWidth=1.5; ctx.beginPath();
  for(let i=0;i<n;i++){ const x=X(i),y=Y(vals[i]); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  // 持仓参考线（成本/止盈/止损）+ 触及/回本提示
  _lines.forEach(L=>{ const y=Y(L.py!=null?L.py:L.p); const off=(L.py!=null && Math.abs(L.py-L.p)>1e-9); ctx.setLineDash([5,4]); ctx.strokeStyle=L.color; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(8,y); ctx.lineTo(cw,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=L.color; ctx.font='10px sans-serif'; ctx.textAlign='left'; ctx.fillText(L.text+(off?(L.p>L.py?' ↑超出图外':' ↓超出图外'):''), 10, y-3); });
  if(_hl){ const cur=priceOf(state.selected); if(cur>0){ let badge='', bcol='';
    if(_hl.target>0 && cur>=_hl.target){ badge='现价已触及止盈线 ✔'; bcol='#e01f22'; }
    else if(_hl.stop>0 && cur<=_hl.stop){ badge='现价已触及止损线 ⚠'; bcol='#0f9d58'; }
    else if(_hl.cost>0 && cur<_hl.cost){ badge='浮亏中 · 回本需涨 +'+((( _hl.cost-cur)/cur)*100).toFixed(2)+'%'; bcol='#e0a000'; }
    if(badge){ ctx.fillStyle=bcol; ctx.font='bold 11px sans-serif'; ctx.textAlign='left'; ctx.fillText(badge, 10, 13); } } }
  ctx.fillStyle=FLAT; ctx.textAlign='center';
  const navTicks = n<=20?5: n<=60?4:3;
  for(let g=0;g<navTicks;g++){
    const i=Math.floor((n-1)*g/(navTicks-1));
    if(sub[i]){
      const label=smartDateLabel(sub[i].t, nav.length);
      const tx=X(i);
      const lx=Math.max(ctx.measureText(label).width/2+2, Math.min(cw-ctx.measureText(label).width/2-2, tx));
      ctx.fillText(label, lx, h-6);
    }
  }
  ctx.textAlign='left';
  // 悬停
  if(cv._hover!=null){ const idx=cv._hover-start; if(idx>=0&&idx<n){ const x=X(idx), y=Y(vals[idx]);
    ctx.save(); ctx.strokeStyle='#94a3b8'; ctx.setLineDash([3,3]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h-14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#2b7de9'; ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke(); ctx.restore();
    drawTooltip(ctx,x,y,[new Date(sub[idx].t).toLocaleDateString('zh-CN'),'净值 '+fmt(vals[idx],4)]);
  }}
  cv._x=X; cv._y=Y; cv._cw=cw;
  if(!cv._pzBound){
    bindPanZoom(cv,()=>cv._fd&&cv._fd.nav?cv._fd.nav.length:0,()=>{ if(cv._fd) drawNav(canvasId,cv._fd); });
    cv.addEventListener('mousemove',e=>{
      if(cv._dragging){ cv._hover=null; return; }
      const n=cv._fd&&cv._fd.nav?cv._fd.nav.length:0; if(!n||!cv._vp) return;
      const rect=cv.getBoundingClientRect(); const x=e.clientX-rect.left;
      const ppi=(rect.width||cv.clientWidth)/cv._vp.count;
      let i=cv._vp.start+Math.floor(x/ppi); i=Math.max(0,Math.min(n-1,i));
      if(cv._hover!==i){ cv._hover=i; drawNav(canvasId,cv._fd); }
    });
    cv.addEventListener('mouseleave',()=>{ if(cv._hover!=null){ cv._hover=null; if(cv._fd) drawNav(canvasId,cv._fd); } });
  }
}

