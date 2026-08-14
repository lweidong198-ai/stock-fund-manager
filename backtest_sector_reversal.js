/* 行业雷达「底部反转确认」(sectorReversal / sectorReversalSeries) 真实数据回测
 * 方法：walk-forward（无前视）——sectorReversalSeries 内部对每根 i 只用 i 及之前数据判定拐点，
 *       故可直接对全量K线调一次得到拐点集合，再统计每个拐点之后 N 日真实涨跌。
 * 评级规则复刻自 js/sectors.js（参数固定、未在本数据上拟合）。
 * 数据源：新浪 getKLineData 日K线（沙箱IP实测可达），未复权；活工具用前复权，短期窗口影响极小。
 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const CACHE=path.join(ROOT,'.cache_reversal'); fs.mkdirSync(CACHE,{recursive:true});
const ctx={Math,Date,console,JSON,Array,Object,Number,isFinite}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/sectors.js'),'utf8'), ctx);
const seriesFn=ctx.sectorReversalSeries;

// 与 js/sectors.js 的 INDUSTRY_POOL 保持一致（const 在 vm 顶层不挂 context，故硬编码）
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
  ['561790','石油'],['516510','云计算'],['159667','工业母机'],['159892','医美'],
  ['512760','芯片/半导体']
];

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
  console.log('拉取 '+POOL.length+' 只行业ETF历史日K线(新浪)...');
  const kls={};
  for(const [code,name] of POOL){ const kl=await fetchKL(code); if(kl&&kl.length>120){ kls[code]={name,kl}; } await new Promise(r=>setTimeout(r,300)); }
  const codes=Object.keys(kls);
  console.log('成功 '+codes.length+' 只，样本区间 '+kls[codes[0]].kl[0].date+' ~ '+kls[codes[0]].kl[kls[codes[0]].kl.length-1].date);

  const Ns=[5,10,20,60];
  const rev={n:0,fwd:{},pos:{},ss:{}}, all={n:0,fwd:{},pos:{},ss:{}};
  for(const N of Ns){ for(const o of [rev,all]){ o.fwd[N]=0; o.pos[N]=0; o.ss[N]=0; } }
  let totalDays=0;

  for(const [code,o] of Object.entries(kls)){
    const kl=o.kl, L=kl.length;
    const dates=seriesFn(kl);
    const idxSet=new Set(dates.map(d=>{ const i=kl.findIndex(x=>x.date===d); return i; }).filter(i=>i>=0));
    for(let t=60;t<L-60;t++){
      for(const N of Ns){
        const ft=kl[t+N]; if(!ft) continue;
        const ret=(ft.close/kl[t].close-1)*100;
        all.n++; all.fwd[N]+=ret; all.pos[N]+=(ret>0?1:0); all.ss[N]+=ret*ret;
        if(idxSet.has(t)){ rev.n++; rev.fwd[N]+=ret; rev.pos[N]+=(ret>0?1:0); rev.ss[N]+=ret*ret; }
      }
      totalDays++;
    }
  }

  function report(N){
    const mR=rev.n?rev.fwd[N]/rev.n:null, hR=rev.n?rev.pos[N]/rev.n*100:null;
    const mB=all.fwd[N]/all.n, hB=all.pos[N]/all.n*100;
    let tstat=0;
    if(rev.n>20){ const vR=rev.ss[N]/rev.n-mR*mR, vB=all.ss[N]/all.n-mB*mB; const se=Math.sqrt(vR/rev.n+vB/all.n); tstat=se>0?(mR-mB)/se:0; }
    console.log('\n===== 拐点确认后 '+N+' 日 =====');
    console.log('拐点确认样本: n='+rev.n+'  均值='+(mR>=0?'+':'')+mR.toFixed(2)+'%  胜率='+hR.toFixed(1)+'%');
    console.log('全样本基准:   n='+all.n+'  均值='+(mB>=0?'+':'')+mB.toFixed(2)+'%  胜率='+hB.toFixed(1)+'%');
    console.log('超额='+(mR-mB>=0?'+':'')+(mR-mB).toFixed(2)+'%   t='+tstat.toFixed(2)+'  '+(Math.abs(tstat)>1.96?'显著':'不显著'));
  }
  for(const N of Ns) report(N);
  console.log('\n覆盖 '+codes.length+' 只ETF, 约 '+totalDays+' 交易日样本(walk-forward)');
  console.log('结论：若「拐点确认」t 不显著 → 仅描述性、无可靠预测力（与上次底部信号结论一致），页面只陈述“已现拐点”现状、不喊抄底。');
}
main().catch(e=>{console.error(e);process.exit(1);});
