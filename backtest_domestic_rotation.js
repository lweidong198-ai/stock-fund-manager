// 纯国内可买 ETF 切换算法 walk-forward 回测（腾讯前复权真实日K线，剔除一切美股/跨境）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ASSETS = [
  { code:'sh511380', name:'可转债ETF' },
  { code:'sh511010', name:'国债ETF' },
  { code:'sh510300', name:'沪深300ETF' },
  { code:'sz159915', name:'创业板ETF' },
  { code:'sh518880', name:'黄金ETF' },
  { code:'sh510880', name:'红利ETF' },
  { code:'sh588000', name:'科创50ETF' },
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchOne(code,end){
  const url=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,2000-01-01,${end},2000,qfq`;
  for(let i=0;i<4;i++){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),12000);
      const r=await fetch(url,{headers:{'User-Agent':UA,'Referer':'https://gu.qq.com/'},signal:ctrl.signal});
      clearTimeout(t); const j=await r.json();
      const node=j.data&&j.data[code]; const arr=node&&(node.qfqday||node.day);
      if(arr&&arr.length){ return arr.map(r=>[Date.parse(r[0]),parseFloat(r[2])]); }
    }catch(e){}
    await sleep(400*(i+1));
  }
  return null;
}
async function fetchKline(code){
  const segs=[]; let end='2026-12-31';
  for(let pass=0; pass<12; pass++){
    const seg=await fetchOne(code,end);
    if(!seg||!seg.length) break;
    segs.push(seg);
    const firstTs=seg[0][0];
    if(firstTs<=Date.parse('2018-01-01')) break;
    end=new Date(firstTs-864e5).toISOString().slice(0,10);
    await sleep(200);
  }
  if(!segs.length) return null;
  const map=new Map(); segs.forEach(s=>s.forEach(r=>map.set(r[0],r[1])));
  const all=[...map.entries()].sort((a,b)=>a[0]-b[0]);
  return all.length?all.map(([t,v])=>[t,v]):null;
}
function clean(series){
  const out=series.slice();
  for(let i=1;i<out.length;i++){
    const prev=out[i-1][1]; const cur=out[i][1];
    if(prev>0 && Math.abs(cur/prev-1)>0.5){
      const next = i+1<out.length?out[i+1][1]:prev;
      out[i][1]=(prev+next)/2;
    }
  }
  return out;
}
(async()=>{
  console.log('拉取 '+ASSETS.length+' 只纯国内ETF腾讯前复权日K线...');
  const raw={};
  for(const a of ASSETS){ const k=await fetchKline(a.code); raw[a.code]=k?clean(k):null; console.log(`  ${a.name}(${a.code}): ${k?k.length+'根':'失败'}`); }
  const ok=ASSETS.filter(a=>raw[a.code]);
  if(ok.length<3){ console.log('数据不足'); return; }
  const setMap={}; ok.forEach(a=>setMap[a.code]=new Map(raw[a.code]));
  const allDates=[]; ok.forEach(a=>raw[a.code].forEach(x=>allDates.push(x[0])));
  const dates=[...new Set(allDates)].sort((x,y)=>x-y).filter(t=>ok.every(a=>setMap[a.code].has(t)));
  const price={}; ok.forEach(a=>price[a.code]=dates.map(t=>setMap[a.code].get(t)));
  console.log(`共同交易日: ${dates.length} (${new Date(dates[0]).toISOString().slice(0,10)} ~ ${new Date(dates[dates.length-1]).toISOString().slice(0,10)})`);
  const codes=ok.map(a=>a.code), names=Object.fromEntries(ok.map(a=>[a.code,a.name]));
  const rbMap=new Map(); dates.forEach(t=>{const d=new Date(t);const ym=d.getFullYear()*100+(d.getMonth()+1); if(!rbMap.has(ym)||t>rbMap.get(ym))rbMap.set(ym,t);});
  const rb=[...rbMap.values()].sort((a,b)=>a-b); const idx=new Map(dates.map((t,i)=>[t,i]));
  const COST=0.001;
  function run(name, allocFn, lev=1){
    let eq=1,peak=1,dd=0; const yearly={}; const rets=[]; const prevW={};
    for(let i=0;i<rb.length-1;i++){
      const d=rb[i],dN=rb[i+1],i0=idx.get(d),i1=idx.get(dN);
      const w=allocFn(i0); let ret=0,turn=0; const pw=prevW[name];
      for(const c of codes){ const r=price[c][i1]/price[c][i0]-1; ret+=(w[c]||0)*r; if(pw&&pw[c]!=null) turn+=Math.abs((w[c]||0)-pw[c]); }
      ret=ret*lev - (turn/2)*COST; eq*=(1+ret); rets.push(ret); peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak);
      const y=new Date(dN).getFullYear(); yearly[y]=(yearly[y]||1)*(1+ret); prevW[name]=w;
    }
    const years=(dates[dates.length-1]-dates[0])/(365.25*864e5);
    const cagr=Math.pow(eq,1/years)-1;
    const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
    const varr=rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
    const sharpe=varr<=0?0:(mean-0.02/12)/Math.sqrt(varr)*Math.sqrt(12);
    const nsw=rets.filter((_,k)=>k>0&&Math.abs(rets[k]-rets[k-1])>1e-9).length;
    return {name,cagr,dd,sharpe,yearly,sw:nsw};
  }
  const mom=(i0,L)=>{const p=Math.max(0,i0-L); const m={}; for(const c of codes) m[c]=price[c][i0]/price[c][p]-1; return m;};
  const topN=(m,n)=>{const s=codes.slice().sort((a,b)=>m[b]-m[a]); const w={}; s.slice(0,n).forEach(c=>w[c]=1/n); return w;};
  const BOND='sh511010', CB='sh511380', GOLD='sh518880';
  // 守底规则：best=12M最强；若best<=0→国债；否则若可转债动量>=best→可转债(风险off)；否则best
  const guardian=(i0,L)=>{const m=mom(i0,L); const best=codes.slice().sort((a,b)=>m[b]-m[a])[0];
    if(m[best]<=0) return {[BOND]:1};
    if(m[CB]>=m[best]) return {[CB]:1};
    return {[best]:1};};
  const strat=[
    {name:'纯可转债ETF', fn:i0=>({[CB]:1})},
    {name:'纯国债ETF', fn:i0=>({[BOND]:1})},
    {name:'纯沪深300ETF', fn:i0=>({'sh510300':1})},
    {name:'纯创业板ETF', fn:i0=>({'sz159915':1})},
    {name:'纯黄金ETF', fn:i0=>({[GOLD]:1})},
    {name:'纯红利ETF', fn:i0=>({'sh510880':1})},
    {name:'动量Top1(12M)全池', fn:i0=>topN(mom(i0,252),1)},
    {name:'动量Top2(12M)全池', fn:i0=>topN(mom(i0,252),2)},
    {name:'可转债守底+绝对动量(12M)', fn:i0=>guardian(i0,252)},
    {name:'可转债守底+绝对动量(6M)', fn:i0=>guardian(i0,126)},
    {name:'可转债 vs 黄金 双强(12M)', fn:i0=>{const m=mom(i0,252); const s=[CB,GOLD].sort((a,b)=>m[b]-m[a])[0]; return m[s]<=0?{[BOND]:1}:{[s]:1};}},
    {name:'黄金守底+绝对动量(12M)', fn:i0=>{const m=mom(i0,252); const best=codes.slice().sort((a,b)=>m[b]-m[a])[0]; if(m[best]<=0)return{[BOND]:1}; if(m[GOLD]>=m[best])return{[GOLD]:1}; return{[best]:1};}},
  ];
  console.log('\n========= 纯国内ETF切换 样本外回测(腾讯前复权, 剔除美股/跨境) =========');
  let best=null;
  for(const s of strat){ const r=run(s.name,s.fn);
    console.log(`\n[${r.name}] 年化 ${(r.cagr*100).toFixed(2)}%  回撤 ${(r.dd*100).toFixed(1)}%  夏普 ${r.sharpe.toFixed(2)}  切换${(r.sw/(rb.length-1)*12).toFixed(1)}次/年`);
    console.log(`  分年度:`, Object.entries(r.yearly).map(([y,v])=>`${y}:${((v-1)*100).toFixed(1)}%`).join('  '));
    if(!best||r.cagr>best.cagr) best=r;
  }
  console.log(`\n>>> 最高组: ${best.name} → 年化 ${(best.cagr*100).toFixed(2)}%  回撤 ${(best.dd*100).toFixed(1)}%`);
})();
