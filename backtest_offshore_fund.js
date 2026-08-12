/* =========================================================================
 * backtest_offshore_fund.js
 * 纯国内 · 场外基金版轮动（无股票账户，支付宝/天天基金/银行APP可买）
 *   候选：黄金ETF联接(000216) ↔ 可转债基金(340001)，都弱则纯债(050027)
 *   规则：每月末看一次，比过去12个月涨跌，黄金强买黄金/弱买可转债/都弱买纯债
 *   数据：东财 pingzhongdata 累计净值（真实），摩擦按场外保守 0.15%/次
 * ========================================================================= */
const https=require('https');
function fetchNAV(code){return new Promise((res,rej)=>{
  https.get('https://fund.eastmoney.com/pingzhongdata/'+code+'.js',{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://fund.eastmoney.com/'}},r=>{
    let d='';r.on('data',c=>d+=c);r.on('end',()=>{
      const m=d.match(/Data_ACWorthTrend\s*=\s*(\[\[.*?\]\])/s);
      if(!m)return rej(new Error(code+' 无数据'));
      try{const arr=JSON.parse(m[1]).map(x=>[new Date(x[0]).toISOString().slice(0,10), x[1]]).filter(x=>x[1]>0);
        res(arr);}catch(e){rej(e);}
    });
  }).on('error',rej);
});}

let NAV={};
function buildSeries(codes){
  const map={}; codes.forEach(c=>map[c]=new Map());
  const all=new Set();
  codes.forEach(c=>NAV[c].forEach(([d,v])=>{ map[c].set(d,v); all.add(d); }));
  const valid=[...all].sort().filter(d=>codes.every(c=>map[c].has(d)));
  return {map,valid};
}

function backtest(codes, freq, momDays, pickFn, COST){
  const {map,valid}=buildSeries(codes);
  if(valid.length<260) return null;
  const idx=new Map(valid.map((t,i)=>[t,i]));
  let rb;
  if(freq==='monthly'){
    const mm=new Map(); valid.forEach(t=>{ const d=new Date(t); const ym=d.getFullYear()*100+(d.getMonth()+1); if(!mm.has(ym)||t>mm.get(ym)) mm.set(ym,t); });
    rb=[...mm.values()].sort();
  } else rb=valid;
  const mom=i0=>{ const p=Math.max(0,i0-momDays); const o={}; codes.forEach(c=>{ const ph=map[c].get(valid[p]); const cu=map[c].get(valid[i0]); o[c]=(ph>0&&cu>0)?cu/ph-1:0; }); return o; };
  let eq=1,peak=1,dd=0,prev=null,sw=0,cost=0; const rets=[];
  for(let k=0;k<rb.length-1;k++){
    const i0=idx.get(rb[k]), i1=idx.get(rb[k+1]);
    const w=pickFn(mom(i0));
    const a=map[w].get(valid[i0]), b=map[w].get(valid[i1]);
    const ret=(a>0&&b>0)?b/a-1:0;
    const turn=prev?(prev!==w?2:0):0;
    const cst=(turn/2)*COST;
    if(prev&&turn>0) sw++;
    cost+=cst; eq*=(1+ret-cst); rets.push(ret-cst);
    peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak); prev=w;
  }
  const yrs=(Date.parse(valid[valid.length-1])-Date.parse(valid[0]))/(365.25*864e5);
  const cagr=Math.pow(eq,1/yrs)-1;
  const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const varr=rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(rets.length-1);
  const sharpe=varr>0?(mean-0.02/12)/Math.sqrt(varr)*Math.sqrt(12):0;
  return {cagr,dd,sharpe,swPerYr:sw/yrs,costPerYr:cost/yrs,last:valid[valid.length-1],first:valid[0],n:valid.length};
}

function holdOne(code){
  const m=new Map(NAV[code]);
  const ks=[...m.keys()].sort();
  if(ks.length<260) return null;
  let eq=1,peak=1,dd=0; const rets=[];
  for(let i=1;i<ks.length;i++){ const r=m.get(ks[i])/m.get(ks[i-1])-1; eq*=(1+r); rets.push(r); peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak); }
  const yrs=(Date.parse(ks[ks.length-1])-Date.parse(ks[0]))/(365.25*864e5);
  const cagr=Math.pow(eq,1/yrs)-1;
  const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const varr=rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(rets.length-1);
  const sharpe=varr>0?(mean-0.02/12)/Math.sqrt(varr)*Math.sqrt(12):0;
  return {cagr,dd,sharpe,first:ks[0],last:ks[ks.length-1],n:ks.length};
}

// 双强：黄金 vs 可转债，都弱买纯债
const pickDual=m=>{
  const g=m['000216'], c=m['340001'];
  if(g>=0 && g>=c) return '000216';
  if(c>=0) return '340001';
  return '050027';
};

(async()=>{
  const codes=['000216','340001','050027'];
  for(const c of codes){ NAV[c]=await fetchNAV(c); console.log('拉取',c,'点',NAV[c].length,'首',NAV[c][0][0],'末',NAV[c][NAV[c].length-1][0]); }
  const span=NAV['000216'][0][0]+' ~ '+NAV['000216'][NAV['000216'].length-1][0];
  console.log('\n=== 场外基金版 · 真实净值回测（'+span+'）===');
  const COST=0.0015; // 场外保守摩擦：申购0.1%+赎回0.05%（持>7天）
  const dual=backtest(codes,'monthly',252,pickDual,COST);
  console.log('\n【双强轮动 黄金↔可转债+纯债兜底 · 月频】');
  console.log('  年化',(dual.cagr*100).toFixed(2)+'%  回撤',(dual.dd*100).toFixed(1)+'%  夏普',dual.sharpe.toFixed(2),' 切换/年',dual.swPerYr.toFixed(1),' 摩擦/年',(dual.costPerYr*100).toFixed(2)+'%');
  for(const c of codes){
    const h=holdOne(c);
    const nm={'000216':'黄金ETF联接','340001':'兴全可转债','050027':'博时信用债纯债'}[c];
    console.log('  单持 '+nm+'('+c+')：年化',(h.cagr*100).toFixed(2)+'%  回撤',(h.dd*100).toFixed(1)+'%  夏普',h.sharpe.toFixed(2));
  }
  // 日频对照
  const dualD=backtest(codes,'daily',252,pickDual,COST);
  console.log('\n【对照·日频双强】年化',(dualD.cagr*100).toFixed(2)+'%  回撤',(dualD.dd*100).toFixed(1)+'%  夏普',dualD.sharpe.toFixed(2),' 切换/年',dualD.swPerYr.toFixed(1));
  console.log('\n样本天数',dual.n,'  月频切换',(dual.swPerYr*((dual.n/252))).toFixed(0),'次区间');
})();
