// 宽候选池切换算法 walk-forward 回测（腾讯前复权真实日K线）
// 覆盖：A股宽基/行业 + 商品 + 债券 + 非美跨境QDII（全部 A股账户人民币可买）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ASSETS = [
  // A股宽基/行业
  { code:'sh510300', name:'沪深300ETF' },
  { code:'sh510500', name:'中证500ETF' },
  { code:'sz159915', name:'创业板ETF' },
  { code:'sh588000', name:'科创50ETF' },
  { code:'sh510880', name:'红利ETF' },
  { code:'sh512880', name:'证券ETF' },
  // 商品
  { code:'sh518880', name:'黄金ETF' },
  { code:'sz159980', name:'有色ETF' },
  { code:'sz159985', name:'豆粕ETF' },
  { code:'sh515220', name:'煤炭ETF' },
  // 债券
  { code:'sh511380', name:'可转债ETF' },
  { code:'sh511010', name:'国债ETF' },
  { code:'sh511220', name:'城投债ETF' },
  // 非美跨境QDII（人民币买，投海外非美股）
  { code:'sh510900', name:'恒生ETF' },
  { code:'sh513180', name:'恒生科技ETF' },
  { code:'sh513520', name:'日经ETF' },
  { code:'sh513030', name:'德国ETF(DAX)' },
  { code:'sh164824', name:'印度基金LOF' },
  { code:'sh513080', name:'法国CAC40ETF' },
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
  for(let pass=0; pass<14; pass++){
    const seg=await fetchOne(code,end);
    if(!seg||!seg.length) break;
    segs.push(seg);
    const firstTs=seg[0][0];
    if(firstTs<=Date.parse('2017-01-01')) break;
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
  console.log('拉取 '+ASSETS.length+' 只宽池ETF腾讯前复权日K线...');
  const raw={};
  for(const a of ASSETS){ const k=await fetchKline(a.code); raw[a.code]=k?clean(k):null; console.log(`  ${a.name}(${a.code}): ${k?k.length+'根  '+new Date(k[0][0]).toISOString().slice(0,10):'失败'}`); }
  const ok=ASSETS.filter(a=>raw[a.code]);
  if(ok.length<3){ console.log('数据不足'); return; }
  // 并集日期，缺失填 null
  const allDates=[]; ok.forEach(a=>raw[a.code].forEach(x=>allDates.push(x[0])));
  const dates=[...new Set(allDates)].sort((x,y)=>x-y);
  const setMap={}; ok.forEach(a=>setMap[a.code]=new Map(raw[a.code]));
  const price={}; const firstIdx={}; const lastIdx={};
  ok.forEach(a=>{ const arr=raw[a.code]; firstIdx[a.code]=dates.indexOf(arr[0][0]); lastIdx[a.code]=dates.indexOf(arr[arr.length-1][0]);
    price[a.code]=dates.map(t=>setMap[a.code].has(t)?setMap[a.code].get(t):null); });
  console.log(`并集交易日: ${dates.length} (${new Date(dates[0]).toISOString().slice(0,10)} ~ ${new Date(dates[dates.length-1]).toISOString().slice(0,10)})`);
  const codes=ok.map(a=>a.code), names=Object.fromEntries(ok.map(a=>[a.code,a.name]));
  const rbMap=new Map(); dates.forEach(t=>{const d=new Date(t);const ym=d.getFullYear()*100+(d.getMonth()+1); if(!rbMap.has(ym)||t>rbMap.get(ym))rbMap.set(ym,t);});
  const rb=[...rbMap.values()].sort((a,b)=>a-b); const idx=new Map(dates.map((t,i)=>[t,i]));
  const COST=0.001;
  // 在某调仓点 i0，哪些标的已上市且数据足够(L根)
  const availAt=(i0,L)=>codes.filter(c=>firstIdx[c]<=i0-L && lastIdx[c]>=i0);
  function run(name, allocFn, lev=1){
    let eq=1,peak=1,dd=0; const yearly={}; const rets=[]; const prevW={};
    for(let i=0;i<rb.length-1;i++){
      const d=rb[i],dN=rb[i+1],i0=idx.get(d),i1=idx.get(dN);
      const w=allocFn(i0); let ret=0,turn=0; const pw=prevW[name];
      for(const c of codes){ const p0=price[c][i0],p1=price[c][i1]; if(p0==null||p1==null) continue; const r=p1/p0-1; ret+=(w[c]||0)*r; if(pw&&pw[c]!=null) turn+=Math.abs((w[c]||0)-pw[c]); }
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
  const momOf=(i0,L)=>{const p=Math.max(0,i0-L); const m={}; for(const c of availAt(i0,L)){ const v0=price[c][p],v1=price[c][i0]; if(v0==null||v1==null)continue; m[c]=v1/v0-1; } return m;};
  const topN=(m,n)=>{const s=Object.keys(m).slice().sort((a,b)=>m[b]-m[a]); const w={}; s.slice(0,n).forEach(c=>w[c]=1/n); return w;};
  const BOND='sh511010', CB='sh511380', GOLD='sh518880';
  const guardian=(i0,L,safe)=>{const m=momOf(i0,L); const ks=Object.keys(m); if(!ks.length) return {[BOND]:1}; const best=ks.slice().sort((a,b)=>m[b]-m[a])[0]; if(m[best]<=0) return {[BOND]:1}; if(m[safe]>=m[best]) return {[safe]:1}; return {[best]:1};};
  // 池子分类
  const DOMESTIC_EQ=['sh510300','sh510500','sz159915','sh588000','sh510880','sh512880'];
  const CROSS=['sh510900','sh513180','sh513520','sh513030','sh164824','sh513080'];
  const hasCross=i0=>CROSS.some(c=>firstIdx[c]<=i0-252 && lastIdx[c]>=i0);
  const strat=[
    {name:'纯黄金ETF', fn:i0=>({[GOLD]:1})},
    {name:'纯可转债ETF', fn:i0=>({[CB]:1})},
    {name:'纯国债ETF', fn:i0=>({[BOND]:1})},
    {name:'纯沪深300ETF', fn:i0=>({'sh510300':1})},
    {name:'纯恒生科技ETF', fn:i0=>({'sh513180':1})},
    {name:'纯日经ETF', fn:i0=>({'sh513520':1})},
    {name:'纯印度基金', fn:i0=>({'sh164824':1})},
    {name:'动量Top1(12M) 全宽池', fn:i0=>topN(momOf(i0,252),1)},
    {name:'动量Top2(12M) 全宽池', fn:i0=>topN(momOf(i0,252),2)},
    {name:'动量Top3(12M) 全宽池', fn:i0=>topN(momOf(i0,252),3)},
    {name:'可转债守底+绝对动量(12M)', fn:i0=>guardian(i0,252,CB)},
    {name:'黄金守底+绝对动量(12M)', fn:i0=>guardian(i0,252,GOLD)},
    {name:'双强: 可转债 vs 黄金(12M)', fn:i0=>{const m=momOf(i0,252); const s=[CB,GOLD].sort((a,b)=>(m[b]||-9)-(m[a]||-9))[0]; return (m[s]||0)<=0?{[BOND]:1}:{[s]:1};}},
    {name:'双强: A股最强 vs 黄金(12M)', fn:i0=>{const m={...momOf(i0,252)}; DOMESTIC_EQ.forEach(c=>{if(!(c in m))m[c]=-9;}); const a=Object.keys(m).filter(c=>DOMESTIC_EQ.includes(c)).sort((a,b)=>m[b]-m[a])[0]; const bestA=m[a]||-9; if(bestA<=0&&(m[GOLD]||-9)<=0)return{[BOND]:1}; return (m[GOLD]||-9)>=bestA?{[GOLD]:1}:{[a]:1};}},
    {name:'双强: 跨境最强 vs 黄金(12M)', fn:i0=>{if(!hasCross(i0))return {[GOLD]:1}; const m=momOf(i0,252); const cx=CROSS.filter(c=>c in m); if(!cx.length)return{[GOLD]:1}; const bestCx=cx.slice().sort((a,b)=>m[b]-m[a])[0]; if((m[bestCx]||-9)<=(m[GOLD]||-9))return{[GOLD]:1}; return {[bestCx]:1};}},
  ];
  console.log('\n========= 宽候选池切换 样本外回测(腾讯前复权, 含非美跨境QDII) =========');
  const rows=[];
  for(const s of strat){ const r=run(s.name,s.fn);
    console.log(`\n[${r.name}] 年化 ${(r.cagr*100).toFixed(2)}%  回撤 ${(r.dd*100).toFixed(1)}%  夏普 ${r.sharpe.toFixed(2)}  切换${(r.sw/(rb.length-1)*12).toFixed(1)}次/年`);
    console.log(`  分年度:`, Object.entries(r.yearly).map(([y,v])=>`${y}:${((v-1)*100).toFixed(1)}%`).join('  '));
    rows.push(r);
  }
  rows.sort((a,b)=>b.cagr-a.cagr);
  console.log(`\n>>> Top3 年化:`, rows.slice(0,3).map(r=>`${r.name} ${(r.cagr*100).toFixed(1)}%/回撤${(r.dd*100).toFixed(1)}%`).join('  |  '));
  // 与纯3只版对比
  console.log(`\n(对照: 纯3只黄金↔可转债双强 = 16.80% / 回撤24.3%)`);
})();
