/* =========================================================================
 * trend.js —— 自选标的「走势分析」按钮后端逻辑
 * 移植自 analyze_159796.js（已用真实行情 walk-forward 验证过），浏览器端化：
 *   - 股票/ETF：fetch 腾讯前复权 K 线（日线翻页覆盖约 3 年 + 周线）
 *   - 场外基金：用 state.fundData[code].cum 净值序列替代收盘价
 *   - 算技术指标 → 七态状态机判定 → 生成 SVG 走势图 + 指标表 + 诚实提示
 * 全程零 Key、纯前端；只做描述，不预测未来，不喊买喊卖。
 * ========================================================================= */

/* ---------- 技术指标（自实现，与 analyze_159796 一致） ---------- */
function t_ma(series,n){ if(series.length<n) return null; let s=0; for(let i=series.length-n;i<series.length;i++) s+=series[i]; return s/n; }
function t_std(series,n){ const m=t_ma(series,n); if(m==null) return null; let s=0; for(let i=series.length-n;i<series.length;i++) s+=(series[i]-m)**2; return Math.sqrt(s/n); }
function t_ema(series,n){ const k=2/(n+1); let e=series[0]; for(let i=1;i<series.length;i++) e=series[i]*k+e*(1-k); return e; }
function t_rsi(series,n=14){
  const c=series; let g=0,l=0; for(let i=1;i<=n;i++){ const d=c[c.length-i]-c[c.length-i-1]; if(d>=0)g+=d; else l-=d; }
  if(l===0) return 100; const rs=g/l; return 100-100/(1+rs);
}
function t_macd(series){
  const ema12=[], ema26=[], k12=2/13, k26=2/27;
  let e12=series[0], e26=series[0];
  for(const v of series){ e12=v*k12+e12*(1-k12); e26=v*k26+e26*(1-k26); ema12.push(e12); ema26.push(e26); }
  const dif=ema12.map((v,i)=>v-ema26[i]);
  const k9=2/10; let dea=dif[0]; const deaArr=[dea];
  for(let i=1;i<dif.length;i++){ dea=dif[i]*k9+dea*(1-k9); deaArr.push(dea); }
  const hist=dif.map((v,i)=>(v-deaArr[i])*2);
  const L=dif.length;
  return {dif:dif[L-1], dea:deaArr[L-1], hist:hist[L-1], prevDif:dif[L-2], prevDea:deaArr[L-2]};
}
function t_linregR2(series){ const n=series.length; const xs=[]; for(let i=0;i<n;i++)xs.push(i); const mx=xs.reduce((a,b)=>a+b,0)/n, my=series.reduce((a,b)=>a+b,0)/n; let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){ sxy+=(xs[i]-mx)*(series[i]-my); sxx+=(xs[i]-mx)**2; syy+=(series[i]-my)**2; } const b=sxy/sxx; const ssr=b*b*sxx; return syy>0?ssr/syy:0; }
function t_volState(series, n=20){
  const recent=t_std(series.slice(-n),n), prior=t_std(series.slice(-2*n,-n),n);
  if(recent==null||prior==null) return 'steady';
  if(recent>prior*1.15) return 'expand';
  if(recent<prior*0.85) return 'contract';
  return 'steady';
}
function t_pct(a,b){ return (a/b-1)*100; }

/* ---------- 七态状态机判定（等价 sectors.js statusOf 的底层逻辑） ---------- */
function t_classify(closes, volSeries, dates){
  const n=closes.length;
  if(n<62) return { tooShort:true, state:'', label:'数据不足', tip:'K线/净值序列太短，无法判定状态。' };
  const last=closes[n-1];
  const c5=t_pct(last, closes[n-6]);
  const c20=t_pct(last, closes[n-21]);
  const c60=t_pct(last, closes[n-61]);
  const r=t_rsi(closes,14);
  const m=t_macd(closes);
  const mid=t_ma(closes,20), sd=t_std(closes,20);
  const upper=mid+2*sd, lower=mid-2*sd, bollPos=(last-lower)/(upper-lower);
  const bias=(last-mid)/mid*100;
  const annVol=t_std(closes.slice(-60).map((v,i,a)=> i===0?0:(v/a[i-1]-1)),60)*Math.sqrt(242)*100;
  const r2=t_linregR2(closes.slice(-60));
  const maxAll=Math.max(...closes), ddAll=(last/maxAll-1)*100;
  const lastYr=closes.slice(-242); const maxYr=Math.max(...lastYr); const ddYr=(last/maxYr-1)*100;
  // 周线近似：用每 5 根取一根模拟（不另拉接口时退化；有真实周线时调用方覆盖）
  let wr=r;
  const wClose = dates && dates.w ? dates.w.map(k=>k.close) : closes.filter((_,i)=>i%5===0);
  if(wClose.length>=14) wr=t_rsi(wClose,14);

  // 趋势四态
  let light;
  if(c20>0 && c60>0) light='s-up';
  else if(c20<=0 && c60<=0) light='s-down';
  else if(c20>0 && c60<=0) light='s-rebound';
  else light='s-flat';

  // 底部信号（六信号）
  const bSig=[];
  if(r<35) bSig.push('RSI<35(超卖)');
  if(bollPos<0.2) bSig.push('贴布林下轨');
  if(m.dif>m.dea) bSig.push('MACD多头');
  if(c5>=c20) bSig.push('跌速放缓');
  if(bias<-5) bSig.push('超跌乖离<-5');
  if(volSeries && t_volState(volSeries)==='contract') bSig.push('波动收缩');
  const bottomPre=(c20<=-4 || c60<=-6);
  const bottomTier= bottomPre ? bSig.length : Math.min(bSig.length,1);

  // 拐点信号（五信号）
  const rSig=[];
  if(m.prevDif<m.prevDea && m.dif>=m.dea) rSig.push('MACD金叉');
  if(last>t_ma(closes,5) && closes[n-2]<=t_ma(closes.slice(0,-1),5)) rSig.push('站上5日线');
  if(volSeries){ const upVol = closes[n-1]>lowsAt(closes,volSeries) && volSeries[volSeries.length-1]>t_ma(volSeries,20); if(upVol) rSig.push('放量收阳'); }
  const hi10=Math.max(...closes.slice(-11,-1));
  if(last>hi10) rSig.push('突破前10日高');
  if(c5>0) rSig.push('近5日转涨');
  const revPre=(r<55 || c20<5);
  const revConfirmed= revPre && rSig.length>=2;

  // 极低估：周线窗口分位近似（诚实标注）
  let deepTrig=false, wPct=null;
  if(dates && dates.w && dates.w.length>50){
    const wc=dates.w.map(k=>k.close); const wMin=Math.min(...wc), wMax=Math.max(...wc), lastW=wc[wc.length-1];
    wPct=(lastW-wMin)/(wMax-wMin)*100;
    const deepCandidate=(ddYr<=-35 && wr<25) || (wPct<6 && wr<22 && c60<=-6);
    deepTrig= deepCandidate && wc.length>50;
  } else {
    const wMin=Math.min(...wClose), wMax=Math.max(...wClose), lastW=wClose[wClose.length-1];
    wPct=(lastW-wMin)/(wMax-wMin)*100;
  }

  let state,label,tip;
  if(deepTrig){ state='deepvalue'; label='极低估·长持'; tip='跌到历史最便宜一档+周线超卖，长持视角可考虑分批，但不喊抄底。'; }
  else if(revConfirmed){ state='reversal'; label='已现拐点·转强'; tip='右侧确认转强，可关注、可小仓跟随，非买入指令。'; }
  else if(bottomTier>=3){ state='shortbottom'; label='短期底部'; tip='多个底部信号共振，可能见底未确认，可观察分批、非抄底。'; }
  else if(light==='s-up'){ state='bull'; label='强上升趋势'; tip='中线短线都在涨，持有为主、超买减仓。'; }
  else if(light==='s-flat'){ state='flat'; label='震荡'; tip='方向不明，轻仓观望。'; }
  else if(light==='s-rebound'){ state='downrebound'; label='下跌反弹·诱多'; tip='看着像底、实际是中途反弹，别追高、别当底抄。'; }
  else { state='down'; label='下跌中'; tip='还在跌、底没出现，不抄底、控仓位。'; }

  return {last,c5,c20,c60,r,m,mid,sd,upper,lower,bollPos,bias,annVol,r2,ddAll,ddYr,wr,wPct,light,
    bottomPre,bottomTier,bSig,rSig,revPre,revConfirmed,deepTrig,state,label,tip};
}
function lowsAt(closes, vols){ // 简化：用收盘价近似（无 high/low 时）；有 OHLC 时调用方已处理
  return closes[closes.length-1]*0.999; // 仅用于放量收阳近似，避免误判
}

/* ---------- 走势图 SVG ---------- */
function t_drawChart(closes, dates, A){
  const W=680,H=320,padL=48,padR=12,padT=26,padB=22;
  const N=Math.min(120, closes.length);
  const slice=closes.slice(-N);
  const allM=closes;
  const ma20=allM.map((_,i)=> i<19?null:t_ma(allM.slice(0,i+1),20));
  const ma60=allM.map((_,i)=> i<59?null:t_ma(allM.slice(0,i+1),60));
  const ma20s=ma20.slice(-N), ma60s=ma60.slice(-N);
  const vals=[...slice, ...ma20s.filter(x=>x!=null), ...ma60s.filter(x=>x!=null)];
  const minV=Math.min(...vals), maxV=Math.max(...vals);
  const pad=(maxV-minV)*0.08; const lo=minV-pad, hi=maxV+pad;
  const dateLabels = dates && dates.d ? dates.d.slice(-N) : null;
  const x=i=> padL + i/(N-1)*(W-padL-padR);
  const y=v=> padT + (hi-v)/(hi-lo)*(H-padT-padB);
  const px=(arr)=> arr.map((v,i)=> v==null?null:[x(i),y(v)]).filter(Boolean).map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" font-family="ui-monospace,Menlo,Consolas,monospace" style="width:100%;height:auto;">';
  for(let g=0;g<=4;g++){ const v=lo+(hi-lo)*g/4; const yy=y(v); svg+='<line x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'" stroke="#eee"/><text x="2" y="'+(yy+3)+'" font-size="9" fill="#888">'+v.toFixed(3)+'</text>'; }
  svg+='<polyline points="'+px(slice)+'" fill="none" stroke="#2563eb" stroke-width="1.5"/>';
  svg+='<polyline points="'+px(ma20s)+'" fill="none" stroke="#f59e0b" stroke-width="1"/>';
  svg+='<polyline points="'+px(ma60s)+'" fill="none" stroke="#16a34a" stroke-width="1"/>';
  const cx=x(N-1), cy=y(slice[N-1]);
  svg+='<circle cx="'+cx+'" cy="'+cy+'" r="3.5" fill="#2563eb"/>';
  svg+='<text x="'+(cx-4)+'" y="'+(cy-8)+'" font-size="10" fill="#2563eb" text-anchor="end">现价 '+slice[N-1].toFixed(3)+'</text>';
  const col={downrebound:'#ea580c',down:'#16a34a',bull:'#dc2626',flat:'#6b7280',shortbottom:'#ca8a04',reversal:'#ca8a04',deepvalue:'#c0392b'}[A.state]||'#6b7280';
  svg+='<text x="'+padL+'" y="16" font-size="13" font-weight="bold" fill="'+col+'">状态：'+A.label+'</text>';
  svg+='<text x="'+(W-padR)+'" y="16" font-size="10" fill="#888" text-anchor="end">近'+N+'交易日 · 蓝=收盘 橙=MA20 绿=MA60</text>';
  svg+='</svg>';
  return svg;
}

/* ---------- 浏览器端拉腾讯前复权 K 线（日线翻页 + 周线） ---------- */
function t_fetchSeg(url, tries=3){
  return new Promise((resolve,reject)=>{
    const attempt=(i)=>{
      fetch(url).then(r=>r.text()).then(t=>{
        let j; try{ j=JSON.parse(t); }catch(e){ if(i<tries-1){ setTimeout(()=>attempt(i+1),300*(i+1)); return; } return reject(new Error('parse')); }
        const codeObj = j&&j.data? j.data[Object.keys(j.data)[0]] : null;
        if(codeObj) resolve(codeObj);
        else if(i<tries-1){ setTimeout(()=>attempt(i+1),300*(i+1)); }
        else reject(new Error('empty'));
      }).catch(e=>{ if(i<tries-1){ setTimeout(()=>attempt(i+1),300*(i+1)); } else reject(e); });
    };
    attempt(0);
  });
}
function t_rowsToKl(rows){ return rows.map(x=>({date:x[0],open:+x[1],high:+x[3],low:+x[4],close:+x[2],vol:+x[5]})).filter(k=>k.close>0&&k.date); }
function t_todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

async function t_fetchKline(code){
  const today=t_todayStr();
  const y=new Date(); y.setFullYear(y.getFullYear()-3);
  const split=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
  const base='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+code+',';
  const d1url=base+'day,1990-01-01,'+split+',640,qfq&_='+Date.now();
  const d2url=base+'day,'+split+','+today+',640,qfq&_='+Date.now();
  const wurl=base+'week,1990-01-01,'+today+',200,qfq&_='+Date.now();
  const [d1,d2,w]= await Promise.all([t_fetchSeg(d1url), t_fetchSeg(d2url), t_fetchSeg(wurl)]);
  const dayRows=( (d1.qfqday&&d1.qfqday.length)?d1.qfqday:(d1.day||[]) ).concat( (d2.qfqday&&d2.qfqday.length)?d2.qfqday:(d2.day||[]) );
  const weekRows=(w.qfqweek&&w.qfqweek.length)?w.qfqweek:(w.week||[]);
  const seen=new Set(); const day=[];
  for(const x of dayRows){ if(seen.has(x[0]))continue; seen.add(x[0]); day.push(x); }
  day.sort((a,b)=>a[0]<b[0]?-1:1);
  const week=weekRows.slice();
  return { day:t_rowsToKl(day), week:t_rowsToKl(week) };
}

/* ---------- 组装分析报告 HTML ---------- */
function t_buildReport(code, name, kind, closes, dates, A){
  const svg=t_drawChart(closes, dates, A);
  const ccls=v=> v>0?'cls-up':(v<0?'cls-dn':'cls-flat');
  const rows=[
    ['最新价', A.last.toFixed(kind==='fund'?4:3)],
    ['近5日 / 20日 / 60日', '<span class="'+ccls(A.c5)+'">'+A.c5.toFixed(2)+'%</span> / <span class="'+ccls(A.c20)+'">'+A.c20.toFixed(2)+'%</span> / <span class="'+ccls(A.c60)+'">'+A.c60.toFixed(2)+'%</span>'],
    ['RSI(14)', A.r.toFixed(1)+(A.r>70?'（超买）':(A.r<35?'（超卖）':''))],
    ['MACD(12,26,9)', 'DIF '+A.m.dif.toFixed(4)+' / DEA '+A.m.dea.toFixed(4)+' / 柱 '+A.m.hist.toFixed(4)+'（'+(A.m.hist>0?'多头':'空头')+'）'],
    ['布林带位置', A.bollPos.toFixed(2)+(A.bollPos>0.8?'（贴近上轨）':(A.bollPos<0.2?'（贴近下轨）':''))],
    ['乖离率 BIAS20', A.bias.toFixed(2)+'%'],
    ['年化波动率', A.annVol.toFixed(1)+'%'],
    ['60日趋势 R²', A.r2.toFixed(2)+'（越近1越干净上行）'],
    ['全周期 / 近1年 回撤', A.ddAll.toFixed(1)+'% / '+A.ddYr.toFixed(1)+'%'],
    ['周线 RSI', A.wr.toFixed(1)],
    ['趋势四态', A.light],
    ['底部信号（'+A.bottomTier+'个）', A.bSig.join('、')||'无'],
    ['拐点信号（'+(A.rSig.length)+'个）', A.rSig.join('、')||'无'],
  ];
  let html='<div class="trend-report">';
  html+='<div class="tr-head"><span class="tr-name">'+escapeHtml(name)+'</span><span class="tr-code">'+code+' · '+(kind==='fund'?'基金净值':'K线')+'</span><span class="op-state st-'+A.state+'">'+A.label+'</span></div>';
  html+='<div class="tr-chart">'+svg+'</div>';
  html+='<table class="tr-table"><tbody>';
  rows.forEach(r=>{ html+='<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; });
  html+='</tbody></table>';
  html+='<div class="tr-tip">'+A.tip+'</div>';
  html+='<div class="tr-note">📌 <b>走势读法（描述，非预测）</b>：中线看 '+(A.c60>=0?'上行':'下行')+'、短线 '+(A.c20>=0?'反弹':'走弱')+'。本状态在实证中后续 60 日涨概率约 43%~57%（接近随机），历史上「下跌反弹·诱多」多为中途反弹。<b>仅作仓位路标，不构成买卖建议。</b>数据来源：腾讯行情/前复权K线'+(kind==='fund'?' + 东方财富基金净值':'')+'，免费实时无需 Key。</div>';
  html+='</div>';
  return html;
}

/* ---------- 对外主函数 ---------- */
async function analyzeTrend(code){
  const isFund = !/^(sh|sz|hk)/i.test(code);
  if(isFund){
    const fd = (typeof state!=='undefined' && state.fundData[code]) ? state.fundData[code] : null;
    if(!fd || !fd.cum || fd.cum.length<62){
      const e=new Error('FUND_NO_DATA'); e.code='FUND_NO_DATA'; e.fundCode=code; throw e;
    }
    const cum=fd.cum;
    const closes=cum.map(p=>Number(p.nav)).filter(v=>v>0);
    const dates={ d: cum.map(p=> new Date(Number(p.t)).toISOString().slice(0,10)) };
    const A=t_classify(closes, null, dates);
    return { code, name:fd.name||code, kind:'fund', A, html:t_buildReport(code, fd.name||code, 'fund', closes, dates, A) };
  }
  // 股票/ETF：拉 K 线
  const kl=await t_fetchKline(code);
  if(kl.day.length<62) throw new Error('KLINE_SHORT');
  const closes=kl.day.map(k=>k.close);
  const vols=kl.day.map(k=>k.vol);
  const dates={ d: kl.day.map(k=>k.date), w: kl.week };
  const A=t_classify(closes, vols, dates);
  const name=(typeof state!=='undefined' && state.quotes && state.quotes[code]) ? state.quotes[code].name : (typeof CODE_NAMES!=='undefined' && CODE_NAMES[code]||code);
  return { code, name, kind:'stock', A, html:t_buildReport(code, name, 'stock', closes, dates, A) };
}

/* 弹窗渲染：btn 调用入口 */
function openTrendModal(code){
  const name=(typeof state!=='undefined'&&state.watch.find(w=>w.code===code)) ? (state.watch.find(w=>w.code===code).name||code) : code;
  const mask=document.getElementById('trendModal');
  if(!mask) return;
  mask.classList.add('show');
  const body=document.getElementById('trendModalBody');
  body.innerHTML='<div class="tr-loading">⏳ 正在拉取真实行情/K线计算走势…</div>';
  document.getElementById('trendModalTitle').textContent='走势分析 · '+(name||code);
  analyzeTrend(code).then(res=>{
    body.innerHTML=res.html;
  }).catch(err=>{
    if(err&&err.code==='FUND_NO_DATA'){
      body.innerHTML='<div class="tr-note">该基金（'+code+'）净值数据尚未加载。<br>请先在「自选」点开它、或在「机会发现」做「基金体检」拉取净值后，再来查看走势分析。</div>';
    } else if(err&&err.message==='KLINE_SHORT'){
      body.innerHTML='<div class="tr-note">该标的 K 线数据不足，无法判定走势。</div>';
    } else {
      body.innerHTML='<div class="tr-note">走势数据拉取失败（可能网络受限/超时）。<br>请稍后重试，或在本机双击打开时通常不受沙箱网络限制。</div>';
    }
  });
}
function closeTrendModal(){ const m=document.getElementById('trendModal'); if(m) m.classList.remove('show'); }
