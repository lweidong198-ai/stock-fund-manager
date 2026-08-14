/* 行业雷达「左侧领先早底」信号 真实数据回测
 * 目标：量化 boss 要求的"打破时间差"——把信号从"跌后确认"提前到"底部附近就亮"。
 * 方法：walk-forward（无前视）。领先信号只用 i 及之前数据判定。
 * 数据源：新浪 getKLineData 日K线（沙箱实测可达），未复权；活工具用前复权，短期窗口影响极小。
 * 对照：同一批 ETF、同一区间，对比 滞后拐点(sectorReversalSeries) vs 左侧领先(earlyBottomSeries)。
 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const CACHE=path.join(ROOT,'.cache_reversal'); fs.mkdirSync(CACHE,{recursive:true});

// ---- 复刻 sectors.js 的 INDUSTRY_POOL ----
const POOL=[
  ['159992','医药/医疗'],['512690','白酒/消费'],['515030','新能源车'],['515790','光伏'],
  ['512760','芯片/半导体'],['512660','军工'],['512800','银行'],['512880','证券'],
  ['512400','有色金属'],['515210','钢铁'],['515220','煤炭'],['159870','化工'],
  ['512200','房地产'],['516110','汽车'],['159996','家电'],['159825','农业'],
  ['512980','传媒'],['515880','通信'],['159998','计算机'],['159611','电力'],
  ['159745','建材'],['516780','稀土'],['159755','电池'],['515980','人工智能'],
  ['512070','保险'],['515050','5G通信'],['562500','机器人'],['159869','游戏'],
  ['562510','旅游'],['159865','养殖'],['518880','黄金'],['159861','环保'],
  ['513360','教育'],['159647','中药'],['516670','风电'],['159736','食品饮料'],
  ['561790','石油'],['516510','云计算'],['159667','工业母机'],['159892','医美']
];

// ---- 复用 sectors.js 里已验证的滞后拐点判定 ----
const ctx={Math,Date,console,JSON,Array,Object,Number,isFinite}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/sectors.js'),'utf8'), ctx);
const lagSeriesFn=ctx.sectorReversalSeries;

// ============ 左侧领先「早底」信号（纯函数，参数集中，便于日后迁入 sectors.js）============
function sma(arr,i,w){ if(i<w-1) return null; let s=0; for(let k=i-w+1;k<=i;k++) s+=arr[k]; return s/w; }
function emaArr(arr,n){ const k=2/(n+1); const out=[]; let prev=arr[0]; out[0]=prev; for(let i=1;i<arr.length;i++){ prev=arr[i]*k+prev*(1-k); out[i]=prev; } return out; }
function rsiArr(arr,n){ const out=[]; for(let i=0;i<arr.length;i++){ if(i<n){out.push(50);continue;} let g=0,l=0; for(let k=i-n+1;k<=i;k++){ const d=arr[k]-arr[k-1]; if(d>=0)g+=d; else l-=d; } const rs=g+l>0?g/l:0; out.push(100-100/(1+rs)); } return out; }
function macdArr(arr){ const e12=emaArr(arr,12), e26=emaArr(arr,26); const macd=arr.map((_,i)=>e12[i]-e26[i]); const sig=emaArr(macd,9); const hist=macd.map((m,i)=>m-sig[i]); return {macd,sig,hist}; }
function quantile(sorted,q){ if(!sorted.length) return 0; const pos=(sorted.length-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos); return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo); }

/* 前置：近期偏弱(c20<=0||c60<=0)；≥2 个领先子信号共振 → 确认"早底先兆"
 * L1 超卖:     RSI(14) < 25
 * L2 地量:     volume < 0.6 * 近20日均量（抛压枯竭）
 * L3 底背离:   价创新低(close<=近30日最低) 但 MACD柱更高(momentum不新低)
 * L4 极端乖离: close < MA20 * 0.90
 * L5 估值分位: close < 近250日 15% 分位（一年里最便宜一档）
 */
function earlyBottomSeries(kl){
  const close=kl.map(x=>x.close), vol=kl.map(x=>x.volume), L=kl.length;
  const rsi=rsiArr(close,14), {hist}=macdArr(close);
  const dates=[], sigs=[];
  for(let i=120;i<L;i++){
    // 近期偏弱
    const ma20=sma(close,i,20), ma60=sma(close,i,60);
    const c20 = ma20!=null && i>=21 ? (close[i]/ma20-1)*100 : 0;
    const c60 = ma60!=null && i>=61 ? (close[i]/ma60-1)*100 : 0;
    if(!(c20<=0||c60<=0)) continue;
    let score=0; const sig={};
    // L1 超卖
    if(rsi[i]<25){ score++; sig.rsi=true; }
    // L2 地量
    const v20=sma(vol,i,20); if(v20 && vol[i] < v20*0.6){ score++; sig.vol=true; }
    // L3 底背离（近30日最低）
    let jlo=i-30, m=-1; for(let j=i-30;j<=i-1;j++){ if(m<0||close[j]<close[m]) m=j; }
    if(m>=0 && close[i]<=close[m] && hist[i]>hist[m]){ score++; sig.div=true; }
    // L4 极端乖离
    if(ma20!=null && close[i] < ma20*0.90){ score++; sig.dev=true; }
    // L5 估值分位（近250日）
    const win=close.slice(i-249,i+1); const q=quantile([...win].sort((a,b)=>a-b),0.15);
    if(close[i] < q){ score++; sig.frac=true; }
    if(score>=2){ dates.push(kl[i].date); sigs.push(sig); }
  }
  return {dates,sigs};
}

// ---- 新浪抓取（带缓存，与旧脚本一致）----
async function fetchKL(code){
  const f=path.join(CACHE, code+'.json');
  if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f,'utf8'));
  const sh = code[0]==='6' || code[0]==='5';
  const url='https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol='+(sh?'sh':'sz')+code+'&scale=240&ma=5&datalen=1300';
  for(let attempt=0;attempt<8;attempt++){
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>{try{ctrl.abort();}catch(_){}}, 9000);
      const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0','Referer':'https://finance.sina.com.cn/'}});
      clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const d=await r.json(); if(!Array.isArray(d)||!d.length) throw new Error('empty');
      const kl=d.map(x=>({date:x.day,open:+x.open,close:+x.close,high:+x.high,low:+x.low,volume:+x.volume}));
      fs.writeFileSync(f, JSON.stringify(kl));
      return kl;
    }catch(e){ if(attempt<7) await new Promise(r=>setTimeout(r,600*(attempt+1))); else console.warn('拉取失败',code,e.message); }
  }
  return null;
}

function localBottoms(kl){ // 局部最低点（trough），窗口±8
  const out=[]; const L=kl.length;
  for(let i=8;i<L-8;i++){
    let ok=true; for(let k=1;k<=8;k++){ if(kl[i].close>kl[i-k].close||kl[i].close>kl[i+k].close){ok=false;break;} }
    if(ok) out.push(i);
  }
  return out;
}

async function main(){
  console.log('拉取 '+POOL.length+' 只行业ETF历史日K线(新浪)...');
  const kls={};
  for(const [code,name] of POOL){ const kl=await fetchKL(code); if(kl&&kl.length>120){ kls[code]={name,kl}; } await new Promise(r=>setTimeout(r,250)); }
  const codes=Object.keys(kls);
  console.log('成功 '+codes.length+' 只，样本区间 '+kls[codes[0]].kl[0].date+' ~ '+kls[codes[0]].kl[kls[codes[0]].kl.length-1].date);

  const Ns=[5,10,20,60];
  // 领先信号统计；all = 弱市基准（前置条件成立的所有交易日，真实分布）
  const lead={n:0,fwd:{},pos:{},ss:{}}, all={n:0,fwd:{},pos:{},ss:{}}, lag={n:0,fwd:{},pos:{},ss:{}};
  for(const N of Ns){ for(const o of [lead,all,lag]){ o.fwd[N]=0; o.pos[N]=0; o.ss[N]=0; } }
  // 时间差：对称窗口[b-30,b+30]内最近信号，签名距离(正=底之前亮 / 负=底之后才亮)
  let leadLeadSum=0, leadLeadN=0, lagLeadSum=0, lagLeadN=0;
  let leadFalse=0;
  let troughCaughtByLead=0, troughCaughtByLag=0, troughTotal=0;

  for(const [code,o] of Object.entries(kls)){
    const kl=o.kl, L=kl.length, close=kl.map(x=>x.close);
    const eb=earlyBottomSeries(kl);
    const ebIdx=new Set(eb.dates.map(d=>{ const i=kl.findIndex(x=>x.date===d); return i; }).filter(i=>i>=0));
    const lg=lagSeriesFn(kl);
    const lgIdx=new Set(lg.map(d=>{ const i=kl.findIndex(x=>x.date===d); return i; }).filter(i=>i>=0));
    // 弱市基准集合
    const weakSet=new Set();
    for(let i=120;i<L-60;i++){ const ma20=sma(close,i,20), ma60=sma(close,i,60); const c20=ma20!=null&&i>=21?(close[i]/ma20-1)*100:0; const c60=ma60!=null&&i>=61?(close[i]/ma60-1)*100:0; if(c20<=0||c60<=0) weakSet.add(i); }
    for(const t of weakSet){ for(const N of Ns){ const ft=kl[t+N]; if(!ft) continue; const ret=(ft.close/kl[t].close-1)*100; all.n++; all.fwd[N]+=ret; all.pos[N]+=(ret>0?1:0); all.ss[N]+=ret*ret; } }
    // 领先信号前向收益
    for(const s of ebIdx){ for(const N of Ns){ const ft=kl[s+N]; if(!ft) continue; const ret=(ft.close/kl[s].close-1)*100; lead.n++; lead.fwd[N]+=ret; lead.pos[N]+=(ret>0?1:0); lead.ss[N]+=ret*ret; } }
    // 滞后拐点前向收益（同基准对照）
    for(const s of lgIdx){ for(const N of Ns){ const ft=kl[s+N]; if(!ft) continue; const ret=(ft.close/kl[s].close-1)*100; lag.n++; lag.fwd[N]+=ret; lag.pos[N]+=(ret>0?1:0); lag.ss[N]+=ret*ret; } }
    // 局部底 + 对称窗口最近信号（签名距离）
    const bottoms=localBottoms(kl); troughTotal+=bottoms.length;
    for(const b of bottoms){
      let bdL=-999,bdG=-999;
      for(let s=b-30;s<=b+30;s++){ if(s<0||s>=L) continue; if(ebIdx.has(s)){ const d=b-s; if(bdL===-999||Math.abs(d)<Math.abs(bdL)) bdL=d; } if(lgIdx.has(s)){ const d=b-s; if(bdG===-999||Math.abs(d)<Math.abs(bdG)) bdG=d; } }
      if(bdL!==-999){ leadLeadSum+=bdL; leadLeadN++; troughCaughtByLead++; }
      if(bdG!==-999){ lagLeadSum+=bdG; lagLeadN++; troughCaughtByLag++; }
    }
    // 假底率：信号后20日内创出新低
    for(const s of ebIdx){ let nl=false; for(let t=s+1;t<=Math.min(s+20,L-1);t++){ if(kl[t].close < kl[s].close-1e-9){ nl=true; break; } } if(nl) leadFalse++; }
  }

  function ts(a,N){ const m=a.fwd[N]/a.n, mb=all.fwd[N]/all.n; if(a.n<20) return 0; const va=a.ss[N]/a.n-m*m, vb=all.ss[N]/all.n-mb*mb; const se=Math.sqrt(va/a.n+vb/all.n); return se>0?(m-mb)/se:0; }
  function report(N){
    const mR=lead.fwd[N]/lead.n, hR=lead.pos[N]/lead.n*100, tR=ts(lead,N);
    const mL=lag.fwd[N]/lag.n, hL=lag.pos[N]/lag.n*100, tL=ts(lag,N);
    const mB=all.fwd[N]/all.n, hB=all.pos[N]/all.n*100;
    console.log('\n===== '+N+' 日（同基准：弱市）=====');
    console.log('领先早底: n='+lead.n+'  均值='+(mR>=0?'+':'')+mR.toFixed(2)+'%  胜率='+hR.toFixed(1)+'%  超额='+(mR-mB>=0?'+':'')+(mR-mB).toFixed(2)+'%  t='+tR.toFixed(2)+(Math.abs(tR)>1.96?' 显著':' 不显著'));
    console.log('滞后拐点: n='+lag.n+'  均值='+(mL>=0?'+':'')+mL.toFixed(2)+'%  胜率='+hL.toFixed(1)+'%  超额='+(mL-mB>=0?'+':'')+(mL-mB).toFixed(2)+'%  t='+tL.toFixed(2)+(Math.abs(tL)>1.96?' 显著':' 不显著'));
    console.log('弱市基准: n='+all.n+'  均值='+(mB>=0?'+':'')+mB.toFixed(2)+'%  胜率='+hB.toFixed(1)+'%');
  }

  console.log('\n############ 一、打破时间差（相对局部底的平均提前天数）############');
  console.log('局部底总数: '+troughTotal);
  console.log('领先「早底」捕获局部底: '+troughCaughtByLead+' ('+(troughCaughtByLead/troughTotal*100).toFixed(1)+'%)  平均提前 '+ (leadLeadN? (leadLeadSum/leadLeadN).toFixed(1):'-') +' 天');
  console.log('滞后「拐点」捕获局部底: '+troughCaughtByLag+' ('+(troughCaughtByLag/troughTotal*100).toFixed(1)+'%)  平均提前 '+ (lagLeadN? (lagLeadSum/lagLeadN).toFixed(1):'-') +' 天（负值=底之后才亮）');
  console.log('=> 领先信号比滞后信号平均早亮约 '+ ((lagLeadN&&leadLeadN)? ((leadLeadSum/leadLeadN)-(lagLeadSum/lagLeadN)).toFixed(1):'-') +' 天');

  console.log('\n############ 二、领先信号前向收益（walk-forward）############');
  for(const N of Ns) report(N);

  console.log('\n############ 三、代价：假底率（领先信号后20日内仍创出新低）############');
  console.log('领先信号总数: '+lead.n+'  假底(仍破前低): '+leadFalse+'  假底率='+(lead.n? (leadFalse/lead.n*100).toFixed(1):'-')+'%');

  console.log('\n覆盖 '+codes.length+' 只ETF, 领先信号样本 '+lead.n+' 个');
}

main().catch(e=>{console.error(e);process.exit(1);});
