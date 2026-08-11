/* =========================================================================
 * canvas.js
 * 模块来源小节：Canvas 设置（高清） / 交互式时间轴（拖动+滚轮缩放）
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ Canvas 设置（高清） ============ */
function setup(cv){
  const dpr=window.devicePixelRatio||1;
  // 用实际渲染尺寸而不是 HTML 属性里的固定高度，避免 CSS 缩放或容器未展开时画面空白/变形
  const w=cv.clientWidth||600;
  const h=cv.clientHeight||parseInt(cv.getAttribute('height'),10)||300;
  cv.width=Math.max(1,Math.floor(w*dpr));
  cv.height=Math.max(1,Math.floor(h*dpr));
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h); return {ctx,w,h};
}


/* ============ 交互式时间轴（拖动+滚轮缩放） ============ */
const VP_MIN=20, VP_DEF=250;
function ensureVP(cv,n){
  if(!cv._vp||cv._vp.n!==n) cv._vp={start:Math.max(0,n-VP_DEF),count:Math.min(n,VP_DEF),n:n};
  clampVP(cv._vp,n);
}
function clampVP(vp,n){
  if(!vp) return;
  vp.n=n;
  if(vp.count<VP_MIN) vp.count=Math.min(VP_MIN,n);
  if(vp.count>n) vp.count=n;
  if(vp.start<0) vp.start=0;
  if(vp.start>n-vp.count) vp.start=n-vp.count;
}
function syncVP(fromCv,toIds,n){
  if(!fromCv||!fromCv._vp) return;
  toIds.forEach(id=>{ const c=$(id); if(!c) return; ensureVP(c,n); c._vp.start=fromCv._vp.start; c._vp.count=fromCv._vp.count; c._vp.n=n; });
}
function bindPanZoom(cv, getN, redraw, opts={}){
  if(cv._pzBound) return; cv._pzBound=1;
  let dragging=false,lastX=0,lastY=0;
  const pxPerIdx=()=>{ const n=getN(); if(!n) return 0; const rect=cv.getBoundingClientRect(); return (rect.width||cv.clientWidth||600)/cv._vp.count; };
  // 返回是否真正消费了这段位移：放大后 ppi 很大(如45px/根)，单次 mousemove 的
  // dx 可能不足一格 → di=0。此时必须「不消费」，让残余位移累积到下次，
  // 否则 lastX 被刷新、零头永远被丢弃 → 表现为「放大后怎么拖都不动」。
  const onMove=(dx)=>{
    const n=getN(); if(!n||!cv._vp) return false;
    const ppi=pxPerIdx(); if(!ppi) return false;
    const di=Math.round(dx/ppi);
    if(di===0) return false;
    cv._vp.start=Math.max(0,Math.min(n-cv._vp.count,cv._vp.start-di));
    redraw();
    return true;
  };
  cv.addEventListener('mousedown',e=>{ if(e.button!==0) return; dragging=true; lastX=e.offsetX; lastY=e.offsetY; cv._dragging=true; cv.style.cursor='grabbing'; });
  window.addEventListener('mousemove',e=>{
    if(!dragging) return;
    const rect=cv.getBoundingClientRect(); const x=e.clientX-rect.left; const dx=x-lastX;
    if(Math.abs(dx)>1){ const consumed=onMove(dx); if(consumed) lastX=x; }  // 未消费(di=0)时不刷新 lastX，累积零头
  });
  window.addEventListener('mouseup',()=>{ if(dragging){ dragging=false; cv._dragging=false; cv.style.cursor='crosshair'; } });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    const n=getN(); if(!n||!cv._vp) return;
    const rect=cv.getBoundingClientRect(); const x=e.clientX-rect.left;
    const oldCount=cv._vp.count;
    const factor=e.deltaY<0?0.88:1.12;
    let newCount=Math.max(VP_MIN,Math.min(n,Math.round(oldCount*factor)));
    if(newCount===oldCount){ if(e.deltaY<0) newCount=Math.max(VP_MIN,oldCount-1); else newCount=Math.min(n,oldCount+1); }
    // 以鼠标位置为中心缩放
    const ppi=(rect.width||cv.clientWidth||600)/oldCount;
    const anchorIdx=cv._vp.start+Math.max(0,Math.min(oldCount-1,Math.floor(x/ppi)));
    let newStart=anchorIdx-Math.round((x/((rect.width||cv.clientWidth||600)/newCount)));
    cv._vp.count=newCount; cv._vp.start=Math.max(0,Math.min(n-newCount,newStart));
    redraw();
  },{passive:false});
  // 触屏
  let touchStart=null,touchDist=0;
  cv.addEventListener('touchstart',e=>{
    if(e.touches.length===1){ touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY}; cv._dragging=true; }
    else if(e.touches.length===2){ touchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); cv._dragging=true; }
  },{passive:false});
  cv.addEventListener('touchmove',e=>{
    e.preventDefault();
    const n=getN(); if(!n||!cv._vp) return;
    const rect=cv.getBoundingClientRect();
    if(e.touches.length===1 && touchStart){
      const dx=(e.touches[0].clientX-touchStart.x);
      const ppi=rect.width/cv._vp.count;
      const di=Math.round(dx/ppi);
      if(di!==0){ cv._vp.start=Math.max(0,Math.min(n-cv._vp.count,cv._vp.start-di)); touchStart.x=e.touches[0].clientX; redraw(); }
    }else if(e.touches.length===2){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      if(touchDist>0 && Math.abs(d-touchDist)>3){
        const factor=(d>touchDist)?0.93:1.07;
        let newCount=Math.max(VP_MIN,Math.min(n,Math.round(cv._vp.count*factor)));
        const mid=(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left;
        const oldPpi=rect.width/cv._vp.count; const anchorIdx=cv._vp.start+Math.floor(mid/oldPpi);
        cv._vp.count=newCount;
        const newPpi=rect.width/newCount; cv._vp.start=Math.max(0,Math.min(n-newCount,anchorIdx-Math.floor(mid/newPpi)));
        touchDist=d; redraw();
      }
    }
  },{passive:false});
  cv.addEventListener('touchend',()=>{ touchStart=null; touchDist=0; cv._dragging=false; });
}
function formatDateLabel(t){ const d=new Date(t); return (d.getMonth()+1)+'/'+d.getDate(); }
function drawDateAxis(ctx, subDates, totalN, X, bottomY, cw){
  ctx.fillStyle=FLAT; ctx.textAlign='center';
  const n=subDates.length;
  const ticks = n<=20?5: n<=60?4:3;
  for(let g=0;g<ticks;g++){
    const i=Math.floor((n-1)*g/(ticks-1));
    const d=subDates[i]; if(d==null) continue;
    const label=smartDateLabel(d, totalN);
    const tx=X(i);
    const half=ctx.measureText(label).width/2+2;
    const lx=Math.max(half, Math.min(cw-half, tx));
    ctx.fillText(label, lx, bottomY);
  }
}
function smartDateLabel(dateStr, totalCount){
  // dateStr 形如 '2026-02-27' 或时间戳/Date
  let d;
  if(typeof dateStr==='string' && dateStr.includes('-')) d=new Date(dateStr+'T00:00:00');
  else d=new Date(dateStr);
  if(isNaN(d)) return '';
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  // 数据跨度大时显示年月，跨度小时显示月-日
  if(totalCount>250) return y+'-'+m;
  return m+'-'+day;
}
function countForRange(days, n){ return Math.min(n, Math.max(VP_MIN, days)); }
function setVPRange(cvId, days, n){
  const cv=$(cvId); if(!cv) return;
  ensureVP(cv,n);
  const c=countForRange(days,n);
  cv._vp.count=c; cv._vp.start=Math.max(0,n-c); cv._vp.n=n;
}
function bindRangeButtons(containerId, targetCvId, getN, redraw){
  const c=$(containerId); if(!c) return;
  c.querySelectorAll('.range-btn').forEach(b=>{
    b.onclick=()=>{
      const days=parseInt(b.dataset.days,10);
      setVPRange(targetCvId, days, getN());
      // 同步联动副图
      const main=$(targetCvId); if(main&&main._vp) syncVP(main, Array.from(c.querySelectorAll('[data-sync]')).map(x=>x.dataset.sync).filter(Boolean), getN());
      redraw();
    };
  });
}

