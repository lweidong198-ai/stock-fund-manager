/* 老板需求：从约12%成功(信号后上涨)的早底信号里，找出它们"长什么样"，
 * 再用信号亮起时就能看到的因子做过滤，看命中率能否从~12%往上提。
 * 全程 walk-forward 无前视：因子快照只用 i 及之前数据；未来收益仅作标签。
 * 数据源：复用新浪缓存(.cache_reversal)。
 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const CACHE=path.join(ROOT,'.cache_reversal'); fs.mkdirSync(CACHE,{recursive:true});

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

function sma(arr,i,w){ if(i<w-1) return null; let s=0; for(let k=i-w+1;k<=i;k++) s+=arr[k]; return s/w; }
function emaArr(arr,n){ const k=2/(n+1); const out=[]; let prev=arr[0]; out[0]=prev; for(let i=1;i<arr.length;i++){ prev=arr[i]*k+prev*(1-k); out[i]=prev; } return out; }
function rsiArr(arr,n){ const out=[]; for(let i=0;i<arr.length;i++){ if(i<n){out.push(50);continue;} let g=0,l=0; for(let k=i-n+1;k<=i;k++){ const d=arr[k]-arr[k-1]; if(d>=0)g+=d; else l-=d; } const rs=g+l>0?g/l:0; out.push(100-100/(1+rs)); } return out; }
function macdArr(arr){ const e12=emaArr(arr,12), e26=emaArr(arr,26); const macd=arr.map((_,i)=>e12[i]-e26[i]); const sig=emaArr(macd,9); const hist=macd.map((m,i)=>m-sig[i]); return {macd,sig,hist}; }
function quantile(sorted,q){ if(!sorted.length) return 0; const pos=(sorted.length-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos); return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo); }

// 早底信号 + 因子快照（全用 i 及之前数据，无前视）
function earlySnap(kl){
  const close=kl.map(x=>x.close), vol=kl.map(x=>x.volume), L=kl.length;
  const rsi=rsiArr(close,14), {hist}=macdArr(close);
  const out=[];
  for(let i=120;i<L;i++){
    const ma20=sma(close,i,20), ma60=sma(close,i,60);
    const c20=ma20!=null&&i>=21?(close[i]/ma20-1)*100:0;
    const c60=ma60!=null&&i>=61?(close[i]/ma60-1)*100:0;
    if(!(c20<=0||c60<=0)) continue;
    let score=0; const sig={};
    const rsiV=rsi[i];
    if(rsiV<25){score++;sig.rsi=true;}
    const v20=sma(vol,i,20); let volr=null;
    if(v20){ volr=vol[i]/v20; if(volr<0.6){score++;sig.vol=true;} }
    let m=-1; for(let j=i-30;j<=i-1;j++){ if(m<0||close[j]<close[m]) m=j; }
    let divAmt=0;
    if(m>=0 && close[i]<=close[m] && hist[i]>hist[m]){ score++; sig.div=true; divAmt=hist[i]-hist[m]; }
    let dev=null; if(ma20!=null){ dev=close[i]/ma20-1; if(close[i]<ma20*0.90){score++;sig.dev=true;} }
    const win=close.slice(i-249,i+1);
    let jq=0; for(let k=0;k<win.length;k++){ if(win[k]<close[i]) jq++; } const fracPct=jq/(win.length-1);
    if(close[i] < quantile([...win].sort((a,b)=>a-b),0.15)){ score++; sig.frac=true; }
    if(score>=2) out.push({date:kl[i].date,i,rsi:rsiV,volr,dev,c20,fracPct,divAmt,score,sig:Object.keys(sig)});
  }
  return out;
}

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

async function main(){
  console.log('加载 '+POOL.length+' 只行业ETF缓存...');
  const kls={};
  for(const [code,name] of POOL){ const kl=await fetchKL(code); if(kl&&kl.length>180){ kls[code]={name,kl}; } await new Promise(r=>setTimeout(r,50)); }
  const codes=Object.keys(kls);
  console.log('成功 '+codes.length+' 只');

  // 收集所有信号快照 + 标签
  const rows=[]; let dirty=0; // dirty=被ETF拆分假涨幅污染的脏信号数
  for(const code of codes){
    const o=kls[code], kl=o.kl, L=kl.length, close=kl.map(x=>x.close);
    const snaps=earlySnap(kl);
    for(const s of snaps){
      const i=s.i; const ret=N=>{ const ft=kl[i+N]; return ft? (ft.close/kl[i].close-1)*100 : null; };
      const r5=ret(5),r10=ret(10),r20=ret(20),r60=ret(60);
      // 剔除 ETF 拆分导致的假涨幅/假跌幅（相邻无复权价格跳变 >150%）
      const ok=[r5,r10,r20,r60].every(x=> x==null || ((x/100+1)>=0.4 && (x/100+1)<=2.5));
      if(!ok){ dirty++; continue; }
      // stable20: 信号后20日内最低收盘价 > 信号日收盘(未破前低)
      let minC=Infinity; for(let t=i+1;t<=Math.min(i+20,L-1);t++) minC=Math.min(minC,kl[t].close);
      const stable20 = minC > kl[i].close - 1e-9;
      rows.push({code,name:o.name,date:s.date,rsi:s.rsi,volr:s.volr,dev:s.dev,c20:s.c20,fracPct:s.fracPct,divAmt:s.divAmt,score:s.score,sig:s.sig, ret5:r5,ret10:r10,ret20:r20,ret60:r60, stable20});
    }
  }
  const n=rows.length;
  const succ=rows.filter(r=>r.ret60!=null && r.ret60>0);
  const fail=rows.filter(r=>r.ret60!=null && r.ret60<=0);
  console.log('\n############ 总体 ############');
  console.log('早底信号总数: '+n+'  60日上涨(成功): '+succ.length+' ('+(succ.length/n*100).toFixed(1)+'%)  60日下跌(失败): '+fail.length);

  console.log('\n############ A. 成功组 vs 失败组 因子对比（找那12%长啥样）############');
  const fields=[['rsi','信号日RSI'],['volr','量比(vol/20日均量)'],['dev','乖离(close/MA20-1)'],['c20','20日动量%'],['fracPct','估值分位(0~1,越小越便宜)'],['divAmt','底背离幅度'],['score','共振子信号数']];
  console.log('因子'.padEnd(22)+'成功组均值'.padEnd(14)+'失败组均值'.padEnd(14)+'差异');
  for(const [f,label] of fields){
    const av=a=>a.reduce((s,x)=>s+(x[f]==null?0:x[f]),0)/a.length;
    const mS=av(succ), mF=av(fail);
    const diff = (mS-mF);
    let mark='';
    // 方向直觉：RSI更低=更超卖(好)、量比更低=更地量(好)、乖离更负=更极端(好)、估值分位更低=更便宜(好)、底背离幅度更>0(好)、score更高(强共振好)
    if(f==='rsi'||f==='volr'||f==='dev'||f==='fracPct'){ mark = diff<0?'←成功组更极端(更可能是真底)':'→失败组更极端'; }
    else if(f==='divAmt'||f==='score'){ mark = diff>0?'←成功组更强(更可能是真底)':'→失败组更强'; }
    else if(f==='c20'){ mark = diff<0?'←成功组跌更深':'→'; }
    console.log(label.padEnd(22)+mS.toFixed(3).padEnd(14)+mF.toFixed(3).padEnd(14)+mark);
  }

  console.log('\n############ B. 分层命中率（先验阈值，walk-forward无前视）############');
  function hitRate(subset, label){
    if(!subset.length){ console.log(label.padEnd(34)+' 样本0'); return; }
    const s=subset.filter(r=>r.ret60!=null&&r.ret60>0).length;
    const st=subset.filter(r=>r.stable20).length;
    const avg=subset.reduce((a,r)=>a+(r.ret60||0),0)/subset.length;
    console.log(label.padEnd(34)+' n='+String(subset.length).padEnd(6)+' 60日胜率='+(s/subset.length*100).toFixed(1)+'%  底部稳固度(20日不破)='+(st/subset.length*100).toFixed(1)+'%  平均60日='+(avg>=0?'+':'')+avg.toFixed(2)+'%');
  }
  hitRate(rows,'全部早底信号(基线~45%)');
  // 按 score 分层
  for(let sc=2;sc<=5;sc++) hitRate(rows.filter(r=>r.score===sc), '  共振数='+sc);
  // 按估值分位分层
  hitRate(rows.filter(r=>r.fracPct<0.05),'  估值分位<5%(一年最便宜)');
  hitRate(rows.filter(r=>r.fracPct<0.10),'  估值分位<10%');
  hitRate(rows.filter(r=>r.fracPct<0.15),'  估值分位<15%(原阈值)');
  // 按量比
  hitRate(rows.filter(r=>r.volr!=null&&r.volr<0.5),'  量比<0.5(极地量)');
  hitRate(rows.filter(r=>r.volr!=null&&r.volr<0.4),'  量比<0.4');
  // 底背离
  hitRate(rows.filter(r=>r.sig.includes('div')),'  含底背离');
  // RSI 更极端
  hitRate(rows.filter(r=>r.rsi<22),'  RSI<22');
  hitRate(rows.filter(r=>r.rsi<20),'  RSI<20');

  console.log('\n############ C. 组合过滤（逻辑"更极端=更可能是真底"的先验叠加）############');
  hitRate(rows.filter(r=>r.score>=3),'组合1: 共振>=3');
  hitRate(rows.filter(r=>r.score>=3 && r.fracPct<0.10),'组合2: 共振>=3 且 估值<10%');
  hitRate(rows.filter(r=>r.score>=3 && r.fracPct<0.10 && r.sig.includes('div')),'组合3: 共振>=3 + 估值<10% + 底背离');
  hitRate(rows.filter(r=>r.score>=3 && r.fracPct<0.10 && r.sig.includes('div') && r.volr!=null && r.volr<0.5),'组合4: 组合3 + 量比<0.5');
  hitRate(rows.filter(r=>r.score>=3 && r.fracPct<0.10 && r.sig.includes('div') && r.rsi<22),'组合5: 组合3 + RSI<22');

  console.log('\n############ D. Top 成功案例（信号后60日涨幅最高的真实样本）############');
  const top=rows.filter(r=>r.ret60!=null).sort((a,b)=>b.ret60-a.ret60).slice(0,12);
  for(const r of top){
    console.log(r.code+' '+r.name+'  '+r.date+'  60日='+(r.ret60>=0?'+':'')+r.ret60.toFixed(1)+'%  RSI='+r.rsi.toFixed(0)+' 估值分位='+(r.fracPct*100).toFixed(0)+'% 共振='+r.score+' ['+r.sig.join(',')+']');
  }

  console.log('\n覆盖 '+codes.length+' 只ETF, 干净信号样本 '+n+' 个 (剔除ETF拆分脏信号 '+dirty+' 个)');
}
main().catch(e=>{console.error(e);process.exit(1);});
