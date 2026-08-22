/* =========================================================================
 * datacenter.js
 * 模块来源小节：可靠数据中心（n 版）：四个真实统计子模块
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 可靠数据中心（n 版）：四个真实统计子模块 ============ */
function _dr(vals){ const r=[]; for(let i=1;i<vals.length;i++){ const p=Number(vals[i-1]), c=Number(vals[i]); if(p>0) r.push(c/p-1); } return r; }
function _cagr(vals, yrs){ if(vals.length<2||yrs<=0) return 0; const a=Number(vals[0]), b=Number(vals[vals.length-1]); if(a<=0) return 0; return Math.pow(b/a, 1/yrs)-1; }
function _mdd(vals){ let peak=Number(vals[0]), m=0; for(const v of vals){ const x=Number(v); if(x>peak) peak=x; const dd=x/peak-1; if(dd<m) m=dd; } return m; }
function _vol(rets){ if(rets.length<2) return 0; const m=rets.reduce((a,b)=>a+b,0)/rets.length; const v=rets.reduce((a,b)=>a+(b-m)*(b-m),0)/(rets.length-1); return Math.sqrt(v); }
function _sharpe(vals, yrs){ const vol=_vol(_dr(vals))*Math.sqrt(252); if(vol<=0) return 0; return (_cagr(vals,yrs)-0.03)/vol; }
function calcFundMetrics(cum){
  if(!cum||cum.length<2) return null;
  const vals=cum.map(p=>Number(p.nav)).filter(v=>v>0);
  const t0=Number(cum[0].t), t1=Number(cum[cum.length-1].t);
  const yrs=Math.max((t1-t0)/31536000000, cum.length/252, 0.1);
  const span=y=>{ const tgt=t1-y*31536000000; let best=null; for(let i=cum.length-1;i>=0;i--){ if(Number(cum[i].t)<=tgt){ best=cum[i]; break; } } if(!best||Number(best.nav)<=0) return null; return Number(cum[cum.length-1].nav)/Number(best.nav)-1; };
  return { ann:_cagr(vals,yrs), mdd:_mdd(vals), vol:_vol(_dr(vals))*Math.sqrt(252), sharpe:_sharpe(vals,yrs), r1:span(1), r3:span(3), r5:span(5), n:cum.length };
}
function _pearson(a,b){ const n=Math.min(a.length,b.length); if(n<2) return 0; let ma=0,mb=0; for(let i=0;i<n;i++){ma+=a[i];mb+=b[i];} ma/=n;mb/=n; let num=0,da=0,db=0; for(let i=0;i<n;i++){ const xa=a[i]-ma,xb=b[i]-mb; num+=xa*xb; da+=xa*xa; db+=xb*xb; } if(da===0||db===0) return 0; return num/Math.sqrt(da*db); }
function corrMatrix(s){ const n=s.length, m=[]; for(let i=0;i<n;i++){ m[i]=[]; for(let j=0;j<n;j++){ m[i][j]=(i===j)?1:_pearson(s[i],s[j]); } } return m; }
function pricePct(kl, years){ if(!kl||kl.length<60) return null; const arr=kl.slice(-Math.min(years*252, kl.length)).map(b=>Number(b.close)); const cur=arr[arr.length-1]; const below=arr.filter(v=>v<cur).length; return below/arr.length; }
function dcaSim(cum, freq){
  if(!cum||cum.length<10) return null;
  const step=freq==='w'?5:21; let invested=0, units=0; const pts=[];
  for(let i=0;i<cum.length;i+=step){ const nav=Number(cum[i].nav); if(nav<=0) continue; invested+=1000; units+=1000/nav; pts.push({t:Number(cum[i].t), invested, nav}); }
  if(!pts.length) return null;
  let minRatio=1; for(const p of pts){ const r=(units*p.nav)/p.invested; if(r<minRatio) minRatio=r; }
  const last=Number(cum[cum.length-1].nav); const mv=units*last;
  return { invested, units, mv, ret:mv/invested-1, minRatio, n:pts.length, startT:Number(cum[0].t), endT:Number(cum[cum.length-1].t) };
}
const DC_VAL_UNIVERSE=[ {c:'510300',n:'沪深300ETF'},{c:'510500',n:'中证500ETF'},{c:'159915',n:'创业板ETF'},{c:'510050',n:'上证50ETF'},{c:'588000',n:'科创50ETF'},{c:'512100',n:'中证1000ETF'},{c:'510880',n:'红利ETF'},{c:'512010',n:'医药ETF'},{c:'159992',n:'创新药ETF'},{c:'512660',n:'军工ETF'},{c:'515030',n:'新能源ETF'},{c:'512480',n:'半导体ETF'},{c:'159995',n:'芯片ETF'},{c:'561300',n:'AIETF'},{c:'159928',n:'消费ETF'},{c:'512690',n:'酒ETF'},{c:'159736',n:'食品饮料ETF'},{c:'512800',n:'银行ETF'},{c:'512000',n:'券商ETF'},{c:'512070',n:'保险ETF'},{c:'512200',n:'房地产ETF'},{c:'512400',n:'有色金属ETF'},{c:'515220',n:'煤炭ETF'},{c:'515210',n:'钢铁ETF'},{c:'159870',n:'化工ETF'},{c:'159825',n:'农业ETF'},{c:'512980',n:'传媒ETF'},{c:'515050',n:'5G通信ETF'},{c:'159998',n:'计算机ETF'},{c:'159611',n:'电力ETF'},{c:'516110',n:'汽车ETF'},{c:'159996',n:'家电ETF'},{c:'516780',n:'稀土ETF'},{c:'515790',n:'光伏ETF'} ];
function _median(a){ const b=a.filter(v=>v!=null).slice().sort((x,y)=>x-y); if(!b.length) return null; const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; }
function _dcTile(lbl,valTxt,color,frac){ const w=Math.max(0,Math.min(1,frac))*100; return '<div class="dc-tile"><div class="lbl">'+lbl+'</div><div class="v" style="color:'+color+'">'+valTxt+'</div><div class="bar"><i style="width:'+w.toFixed(0)+'%;background:'+color+'"></i></div></div>'; }
function _dcLineChart(inv,mv,w,h){
  const n=inv.length; if(n<2) return '';
  const maxV=Math.max(Math.max(...inv),Math.max(...mv),1); const pad=8;
  const X=i=>pad+(i*(w-2*pad)/(n-1)); const Y=v=>h-pad-(v/maxV)*(h-2*pad);
  let pi='',pm=''; for(let i=0;i<n;i++){ pi+=(i?' ':'')+X(i).toFixed(1)+','+Y(inv[i]).toFixed(1); pm+=(i?' ':'')+X(i).toFixed(1)+','+Y(mv[i]).toFixed(1); }
  const lastUp=mv[n-1]>=inv[n-1]; const mc=lastUp?'#0f9d58':'#e01f22';
  return '<svg class="dc-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'
    +'<line x1="'+pad+'" y1="'+(h-pad)+'" x2="'+(w-pad)+'" y2="'+(h-pad)+'" stroke="#cdd6e3" stroke-width="1"/>'
    +'<polyline fill="none" stroke="#9aa7b8" stroke-width="2" points="'+pi+'"/>'
    +'<polyline fill="none" stroke="'+mc+'" stroke-width="2.5" points="'+pm+'"/>'
    +'<text x="'+(w-pad-2)+'" y="'+(Y(inv[n-1])-4)+'" font-size="11" fill="#9aa7b8" text-anchor="end">投入</text>'
    +'<text x="'+pad+'" y="'+(Y(mv[n-1])-4)+'" font-size="11" fill="'+mc+'">市值</text>'
    +'</svg>';
}
function _dcFundCodes(){ return [...new Set([...state.watch.filter(w=>w.kind==='fund'),...state.hold.filter(h=>h.kind==='fund')].map(x=>x.code))]; }
function _dcFillSels(){
  const codes=_dcFundCodes(); const opt='<option value="">请选择…</option>'+codes.map(c=>'<option value="'+c+'">'+(state.fundData[c]&&state.fundData[c].name?state.fundData[c].name:c)+' ('+c+')</option>').join('');
  const f=$('dcFundSel'), d=$('dcDcaSel'); if(f) f.innerHTML=opt; if(d) d.innerHTML=opt;
}
function dcRunFund(){
  const body=$('dcFundBody'); if(!body) return;
  const code=($('dcFundInput').value||'').trim()||($('dcFundSel').value||'');
  if(!/^\d{6}$/.test(code)){ body.innerHTML='<div class="dc-empty">请输入 6 位基金代码，或先从下拉选一只已加载基金。</div>'; return; }
  if(!(state.fundData[code]&&state.fundData[code].cum&&state.fundData[code].cum.length>2)){
    body.innerHTML='<div class="dc-empty">正在加载 '+code+' 净值…</div>'; loadFund(code);
    let done=false; const t=setInterval(()=>{ if(state.fundData[code]&&state.fundData[code].cum&&state.fundData[code].cum.length>2){ clearInterval(t); done=true; _dcRenderFund(code); } },400); setTimeout(()=>{ if(!done) clearInterval(t); },12000); return;
  }
  _dcRenderFund(code);
}
function _dcRenderFund(code){
  const fd=state.fundData[code]; const m=calcFundMetrics(fd.cum);
  if($('dcFundTime')) $('dcFundTime').textContent='截至 '+new Date(Number(fd.cum[fd.cum.length-1].t)).toLocaleDateString('zh-CN');
  const body=$('dcFundBody'); if(!m){ body.innerHTML='<div class="dc-empty">净值数据不足，无法体检。</div>'; return; }
  const rate=m.sharpe>1?'rate-good':(m.sharpe>=0?'rate-mid':'rate-bad'); const rateTxt=m.sharpe>1?'优秀':(m.sharpe>=0?'中等':'偏弱');
  const up='pct-high', dn='pct-low', pct=x=>x==null?'—':(x*100).toFixed(1)+'%';
  const G='#0f9d58',R='#e01f22',Y='#d99a00';
  const tiles=_dcTile('区间年化',pct(m.ann),m.ann>=0?G:R,Math.min(Math.abs(m.ann)/0.5,1))
    +_dcTile('最大回撤',pct(m.mdd),R,Math.min(Math.abs(m.mdd)/0.6,1))
    +_dcTile('年化波动',pct(m.vol),Y,Math.min(m.vol/0.4,1))
    +_dcTile('夏普比率',m.sharpe.toFixed(2),m.sharpe>1?G:(m.sharpe>=0?Y:R),Math.min(Math.max(m.sharpe,0)/2,1));
  const concl='<div class="dc-concl'+(m.sharpe>=0?'':' warn')+'"> <b>体检结论：</b>夏普 <b>'+m.sharpe.toFixed(2)+'</b>（'+rateTxt+'），风险调整后收益'+(m.sharpe>1?'出色':(m.sharpe>=0?'尚可':'偏弱'))+'；区间年化 <b class="'+(m.ann>=0?up:dn)+'">'+pct(m.ann)+'</b>，但最大回撤达 <b>'+pct(m.mdd)+'</b>，需承受相应波动。近1年 '+pct(m.r1)+'、近3年 '+pct(m.r3)+'、近5年 '+pct(m.r5)+'。'+(m.mdd<-0.3?'⚠ 回撤偏深，仓位宜控。':'')+'</div>';
  body.innerHTML=tiles
    +'<table class="dc"><thead><tr><th>指标</th><th class="num">数值</th><th>说明</th></tr></thead><tbody>'
    +'<tr><td>区间年化</td><td class="num '+(m.ann>=0?up:dn)+'">'+pct(m.ann)+'</td><td>净值复合年化</td></tr>'
    +'<tr><td>最大回撤</td><td class="num '+dn+'">'+pct(m.mdd)+'</td><td>史上最惨跌幅</td></tr>'
    +'<tr><td>年化波动</td><td class="num">'+pct(m.vol)+'</td><td>风险大小</td></tr>'
    +'<tr><td>夏普比率</td><td class="num"><span class="'+rate+'">'+m.sharpe.toFixed(2)+' · '+rateTxt+'</span></td><td>每单位风险的超额收益(无风险3%)</td></tr>'
    +'<tr><td>近1年</td><td class="num '+(m.r1>=0?up:dn)+'">'+pct(m.r1)+'</td><td></td></tr>'
    +'<tr><td>近3年</td><td class="num '+(m.r3>=0?up:dn)+'">'+pct(m.r3)+'</td><td></td></tr>'
    +'<tr><td>近5年</td><td class="num '+(m.r5>=0?up:dn)+'">'+pct(m.r5)+'</td><td></td></tr>'
    +'</tbody></table>'+concl;
}
async function dcRunVal(){
  const body=$('dcValBody'); if(!body) return; body.innerHTML='<div class="dc-empty">正在拉取 K 线测算分位…</div>';
  const rows=[];
  for(const u of DC_VAL_UNIVERSE){ try{ await ensureDataReady(u.c,'stock'); const kl=state.kcache[u.c+'d']; if(kl&&kl.length>60){ rows.push({n:u.n,c:u.c,p3:pricePct(kl,3),p5:pricePct(kl,5)}); } }catch(e){} }
  if(!rows.length){ body.innerHTML='<div class="dc-empty">暂无可用的 K 线数据（请先打开行情看板或行业扫描加载行情）。</div>'; return; }
  if($('dcValTime')) $('dcValTime').textContent='更新 '+ts();
  const med=_median(rows.map(r=>r.p3));
  const tempCls = med==null?'':(med<0.3?'pct-low':(med<0.7?'pct-mid':'pct-high'));
  const tempLab = med==null?'数据不足':(med<0.3?'整体低估':(med<0.7?'整体合理':'整体偏贵'));
  const tempHTML = med==null?'':('<div class="dc-temp"><div><div class="big '+tempCls+'">'+(med*100).toFixed(0)+'%</div><div class="lab '+tempCls+'">'+tempLab+'</div></div><div class="dc-temp-track"><div class="mk" style="left:'+(med*100).toFixed(0)+'%"></div></div></div>');
  const cell=p=>{ if(p==null) return '<td class="num">—</td>'; const cls=p<0.3?'pct-low':(p<0.7?'pct-mid':'pct-high'); const lab=p<0.3?'低估':(p<0.7?'合理':'偏高'); return '<td class="num '+cls+'">'+(p*100).toFixed(0)+'% · '+lab+'</td>'; };
  const sorted=rows.slice().sort((a,b)=>(a.p3==null?9:a.p3)-(b.p3==null?9:b.p3));
  const barlist=sorted.map(r=>{ const p=r.p3==null?0:r.p3; const cls=p<0.3?'pct-low':(p<0.7?'pct-mid':'pct-high'); const col=p<0.3?'#0f9d58':(p<0.7?'#d99a00':'#e01f22'); const lab=p<0.3?'低估':(p<0.7?'合理':'偏高'); return '<div class="dc-bar-row"><span class="nm">'+r.n+'</span><div class="track"><i style="width:'+(p*100).toFixed(0)+'%;background:'+col+'"></i></div><span class="val '+cls+'">'+(r.p3==null?'—':(p*100).toFixed(0)+'% '+lab)+'</span></div>'; }).join('');
  const lowN=rows.filter(r=>r.p3!=null&&r.p3<0.3).length, hiN=rows.filter(r=>r.p3!=null&&r.p3>0.7).length;
  const concl = med==null?'':('<div class="dc-concl'+(med>=0.7?' bad':(med>=0.3?'':' warn'))+'"> <b>市场温度结论：</b>'+rows.length+' 个主要指数/行业当前整估处于【'+tempLab+'】（3年分位中位 <b>'+(med*100).toFixed(0)+'%</b>）。其中 <b>'+lowN+'</b> 个明显低估可关注，<b>'+hiN+'</b> 个明显偏高宜谨慎。下面按「便宜→贵」排序。这是「价格位置温度计」，非市盈率估值。</div>');
  body.innerHTML=tempHTML+'<div class="dc-barlist">'+barlist+'</div>'+concl+'<table class="dc"><thead><tr><th>标的</th><th class="num">3年分位</th><th class="num">5年分位</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r.n+' <span class="meta">'+r.c+'</span></td>'+cell(r.p3)+cell(r.p5)+'</tr>').join('')+'</tbody></table><div class="dc-note">分位=当前价低于历史同区间价格的比例。低=比历史上多数时间便宜，高=偏贵。这是「价格位置温度计」，非市盈率估值。</div>';
}
async function dcRunCorr(){
  const body=$('dcCorrBody'); if(!body) return; body.innerHTML='<div class="dc-empty">正在计算持仓相关性…</div>';
  const holds=state.hold.filter(h=>h.code);
  if(holds.length<2){ body.innerHTML='<div class="dc-empty">持仓至少需 2 只标的才能算相关性。当前持仓 '+(holds.length)+' 只。</div>'; return; }
  const series=[], names=[];
  for(const h of holds){
    let rets=null;
    if(h.kind==='fund'){
      if(!(state.fundData[h.code]&&state.fundData[h.code].cum&&state.fundData[h.code].cum.length>30)){ loadFund(h.code); await new Promise(res=>{ let d=false; const t=setInterval(()=>{ if(state.fundData[h.code]&&state.fundData[h.code].cum&&state.fundData[h.code].cum.length>30){ clearInterval(t); d=true; res(); } },400); setTimeout(()=>{ if(!d) clearInterval(t); res(); },12000); }); }
      const fd=state.fundData[h.code]; if(fd&&fd.cum&&fd.cum.length>30) rets=_dr(fd.cum.map(p=>p.nav));
    } else { await ensureDataReady(h.code,'stock'); const kl=state.kcache[h.code+'d']; if(kl&&kl.length>30) rets=_dr(kl.map(b=>b.close)); }
    if(rets&&rets.length>20){ series.push(rets); names.push((h.kind==='fund'&&state.fundData[h.code]&&state.fundData[h.code].name)?state.fundData[h.code].name:h.code); }
  }
  if(series.length<2){ body.innerHTML='<div class="dc-empty">可用数据不足 2 只（需先加载持仓标的的行情/净值）。</div>'; return; }
  const L=Math.min(...series.map(s=>s.length)); const aligned=series.map(s=>s.slice(s.length-L)); const M=corrMatrix(aligned);
  let html='<table class="dc"><thead><tr><th></th>'+names.map(n=>'<th>'+n+'</th>').join('')+'</tr></thead><tbody>';
  for(let i=0;i<names.length;i++){ html+='<tr><th>'+names[i]+'</th>'; for(let j=0;j<names.length;j++){ const v=M[i][j]; const bg=v>0.7?'#e23b3b':(v>0.3?'#d99a00':'#1f9d55'); html+='<td class="num"><span class="heat" style="background:'+bg+'">'+v.toFixed(2)+'</span></td>'; } html+='</tr>'; }
  html+='</tbody></table>';
  let mp=null; for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){ if(!mp||M[i][j]>mp.v) mp={i,j,v:M[i][j]}; }
  let sum=0,cnt=0; for(let i=0;i<M.length;i++)for(let j=i+1;j<M.length;j++){ sum+=M[i][j]; cnt++; }
  const avg=cnt?sum/cnt:0;
  const avgCol=avg>0.7?'#e23b3b':(avg>0.3?'#d99a00':'#1f9d55');
  const avgBar='<div class="dc-bar-row"><span class="nm">平均相关性</span><div class="track"><i style="width:'+(avg*100).toFixed(0)+'%;background:'+avgCol+'"></i></div><span class="val" style="color:'+avgCol+'">'+avg.toFixed(2)+'</span></div>';
  let diag = mp.v>0.7 ? '⚠ <b>'+names[mp.i]+'</b> 与 <b>'+names[mp.j]+'</b> 相关性高达 <b>'+mp.v.toFixed(2)+'</b>，基本同涨同跌，分散有限。' : (mp.v<0.3 ? '✅ 持仓相关性普遍较低（最高 '+mp.v.toFixed(2)+'），分散度较好，能对冲部分风险。' : '持仓相关性中等（最高 '+mp.v.toFixed(2)+'），有一定分散但仍有同向波动。');
  const conclCls=mp.v>0.7?'bad':(mp.v<0.3?'':'warn');
  const concl='<div class="dc-concl '+conclCls+'"> <b>分散度结论：</b>'+diag+'</div>';
  html='<div class="dc-barlist">'+avgBar+'</div>'+concl+html;
  html+='<div class="dc-note">颜色：<span class="heat" style="background:#e23b3b">红</span> 高相关(集中) · <span class="heat" style="background:#d99a00">黄</span> 中 · <span class="heat" style="background:#1f9d55">绿</span> 低/负相关(分散)。</div>';
  body.innerHTML=html; if($('dcCorrTime')) $('dcCorrTime').textContent='基于 '+L+' 个交易日';
}
function dcRunDca(){
  const body=$('dcDcaBody'); if(!body) return;
  const code=$('dcDcaSel').value, freq=$('dcDcaFreq').value;
  if(!code){ body.innerHTML='<div class="dc-empty">请先从下拉选一只已加载基金。</div>'; return; }
  const fd=state.fundData[code];
  if(!fd||!fd.cum||fd.cum.length<30){ body.innerHTML='<div class="dc-empty">'+(fd&&fd.name?fd.name:code)+' 净值数据不足，无法回测。</div>'; return; }
  const r=dcaSim(fd.cum, freq); if(!r){ body.innerHTML='<div class="dc-empty">数据不足。</div>'; return; }
  if($('dcDcaTime')) $('dcDcaTime').textContent='区间 '+new Date(r.startT).toLocaleDateString('zh-CN')+' ~ '+new Date(r.endT).toLocaleDateString('zh-CN')+'，共 '+r.n+' 期';
  const up='pct-high', dn='pct-low', retc=r.ret>=0?up:dn, minc=r.minRatio>=1?up:dn;
  const step=freq==='w'?5:21; let invested=0,units=0; const invArr=[],mvArr=[];
  for(let i=0;i<fd.cum.length;i+=step){ const nav=Number(fd.cum[i].nav); if(nav<=0) continue; invested+=1000; units+=1000/nav; invArr.push(invested); mvArr.push(units*nav); }
  const chart=_dcLineChart(invArr,mvArr,520,160);
  const conclCls=r.ret>=0?'':'warn';
  const concl='<div class="dc-concl '+conclCls+'"> <b>定投结论：</b>每期¥1000、'+(freq==='w'?'每周':'每月')+'定投，区间累计投入 <b>¥'+Math.round(r.invested).toLocaleString()+'</b>，期末市值 <b>¥'+Math.round(r.mv).toLocaleString()+'</b>，收益 <b class="'+retc+'">'+(r.ret*100).toFixed(1)+'%</b>；定投期间最惨浮亏 <b>'+((r.minRatio-1)*100).toFixed(1)+'%</b>。'+(r.ret>=0?'长期坚持最终盈利，定投摊薄成本有效。':'区间内仍亏损，需结合估值低位坚持。')+'</div>';
  body.innerHTML=chart+concl+'<table class="dc"><thead><tr><th>项目</th><th class="num">数值</th></tr></thead><tbody>'
    +'<tr><td>每期投入</td><td class="num">¥1000</td></tr>'
    +'<tr><td>累计投入</td><td class="num">¥'+Math.round(r.invested).toLocaleString()+'</td></tr>'
    +'<tr><td>期末市值</td><td class="num">¥'+Math.round(r.mv).toLocaleString()+'</td></tr>'
    +'<tr><td>累计收益率</td><td class="num '+retc+'">'+(r.ret*100).toFixed(1)+'%</td></tr>'
    +'<tr><td>定投期间最惨浮亏</td><td class="num '+minc+'">'+((r.minRatio-1)*100).toFixed(1)+'%</td></tr>'
    +'<tr><td>累计份额</td><td class="num">'+r.units.toFixed(2)+'</td></tr>'
    +'</tbody></table><div class="dc-note">模拟假设：每期固定 ¥1000，按自然间隔（周≈5日/月≈21日）取点，用真实历史净值计算；未计申购费，不代表未来收益。</div>';
}
async function renderDataCenter(){ _dcFillSels(); dcRunFund(); dcRunVal(); dcRunCorr(); dcRunDca(); }
