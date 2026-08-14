/* =========================================================================
 * sectors.js
 * 模块来源小节：行业趋势扫描（纯前端·零Key） / 技术面强弱评分（仅描述当前技术形态，不预测未来）
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 行业趋势扫描（纯前端·零Key） ============ */
const INDUSTRY_POOL = [
  {name:'医药/医疗', code:'159992', etf:'创新药ETF'},
  {name:'白酒/消费', code:'512690', etf:'酒ETF'},
  {name:'新能源车', code:'515030', etf:'新能源车ETF'},
  {name:'光伏', code:'515790', etf:'光伏ETF'},
  {name:'芯片/半导体', code:'512760', etf:'芯片ETF'},
  {name:'军工', code:'512660', etf:'军工ETF'},
  {name:'银行', code:'512800', etf:'银行ETF'},
  {name:'证券', code:'512880', etf:'证券ETF'},
  {name:'有色金属', code:'512400', etf:'有色金属ETF'},
  {name:'钢铁', code:'515210', etf:'钢铁ETF'},
  {name:'煤炭', code:'515220', etf:'煤炭ETF'},
  {name:'化工', code:'159870', etf:'化工ETF'},
  {name:'房地产', code:'512200', etf:'地产ETF'},
  {name:'汽车', code:'516110', etf:'汽车ETF'},
  {name:'家电', code:'159996', etf:'家电ETF'},
  {name:'农业', code:'159825', etf:'农业ETF'},
  {name:'传媒', code:'512980', etf:'传媒ETF'},
  {name:'通信', code:'515880', etf:'通信ETF'},
  {name:'计算机', code:'159998', etf:'计算机ETF'},
  {name:'电力', code:'159611', etf:'电力ETF'},
  {name:'建材', code:'159745', etf:'建材ETF'},
  {name:'稀土', code:'516780', etf:'稀土ETF'},
  {name:'电池', code:'159755', etf:'电池ETF'},
  {name:'人工智能', code:'515980', etf:'人工智能ETF'},
  {name:'保险', code:'512070', etf:'保险ETF'},
  {name:'5G通信', code:'515050', etf:'5G通信ETF'},
  {name:'机器人', code:'562500', etf:'机器人ETF'},
  {name:'游戏', code:'159869', etf:'游戏ETF'},
  {name:'旅游', code:'562510', etf:'旅游ETF'},
  {name:'养殖', code:'159865', etf:'养殖ETF'},
  {name:'黄金', code:'518880', etf:'黄金ETF'},
  {name:'环保', code:'159861', etf:'环保ETF'},
  {name:'教育', code:'513360', etf:'教育ETF'},
  {name:'中药', code:'159647', etf:'中药ETF'},
  {name:'风电', code:'516670', etf:'风电ETF'},
  {name:'食品饮料', code:'159736', etf:'食品饮料ETF'},
  {name:'石油', code:'561790', etf:'石油ETF'},
  {name:'云计算', code:'516510', etf:'云计算ETF'},
  {name:'工业母机', code:'159667', etf:'工业母机ETF'},
  {name:'医美', code:'159892', etf:'医美ETF'}
];
/* ETF 份额折算/拆分 后复权（2026-08-11 修）
 * 新浪日K对 ETF 的份额折算不做复权：实测 40 只行业ETF 里有 13 处单日 ×0.33~×0.50（或 ×2.7）的
 * 断崖跳变，例如通信ETF 515880 在 2026-07-06 由 1.579 直接变 0.757（1拆2），
 * 不修会让页面显示「近60日 −57%」这种假暴跌，并污染动量/波动因子。
 * 处理：从最新一根往回扫，遇到单日 <0.65 或 >1.6 的比例即判为折算，按该比例回溯缩放更早的价格。
 * 阈值说明：行业ETF 单日涨跌幅受 ±10%/±20% 限制，正常行情不可能出现 35% 以上跳空。 */
function adjustSplits(kl){
  if(!kl || kl.length < 2) return kl;
  let f = 1, need = false;
  for(let i = kl.length - 1; i > 0; i--){
    const r = kl[i].close / kl[i-1].close;
    if(r < 0.65 || r > 1.6){ need = true; break; }
  }
  if(!need) return kl;
  const out = new Array(kl.length);
  for(let i = kl.length - 1; i >= 0; i--){
    const o = kl[i];
    out[i] = { date:o.date, close:o.close*f, high:(o.high==null?o.high:o.high*f), low:(o.low==null?o.low:o.low*f),
               open:(o.open==null?o.open:o.open*f), vol:o.vol };
    if(i > 0){ const r = kl[i].close / kl[i-1].close; if(r < 0.65 || r > 1.6) f *= r; }
  }
  return out;
}
// 行业/机会模块共用入口：拉到K线后写入 state.kcache 并打 _date，
// 使行业ETF（含518880/515050）纳入 refreshKlinesToToday 的跨日自动刷新网络
// （否则行业模块只在进视图时拉一次，跨日不自愈，会停在旧交易日）。
function loadKlineP(code, period){
  const key = normCode(code)+period;
  state._demoKL = state._demoKL || {};
  return new Promise(res=>loadKline(code, period, (raw, isDemo)=>{
    // 连不上（腾讯接口超时/被限流）→ 绝不返回假数据：直接标记并 resolve(null)，
    // 上层将显示「连不上」占位，而非 demoKline 的随机游走假趋势。
    if(isDemo){ state._demoKL[key]=true; res(null); return; }
    delete state._demoKL[key];
    const kl = adjustSplits(raw);
    if(kl && kl.length){
      const existing = state.kcache[key];
      if(!existing || !existing.length || existing.length < kl.length){  // 不覆盖更完整的缓存（如详情页已补全历史）
        markKlineDate(kl); state.kcache[key]=kl;
      } else { markKlineDate(existing); }   // 已有更完整缓存，仅刷新日期标记
      if(typeof ensureTodayBar==='function') ensureTodayBar(code, period);   // 行情兜底合成今日bar：fqkline滞后时行业ETF K线仍停在上一交易日
    }
    res(kl);
  }, {ignoreReqKey:true}));
}
/* 东方财富 K 线兜底（腾讯 fqkline 被 WAF/限流连不上时用）
 * 实测：push2his.eastmoney.com 返回 200、CORS=*、浏览器 fetch 直接可用、自带前复权(fqt=1)。
 * 仅在 loadKlineP 返回空（腾讯挂）时调用，腾讯正常时不触发。东财也挂则返回 null（上层诚实标灰“连不上”，不显假数据）。 */
async function fetchEMKline(secid){
  const url='https://push2his.eastmoney.com/api/qt/stock/kline/get?secid='+secid
    +'&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg=0&end=20500101&lmt=700&_='+Date.now();
  let lastErr=null;
  for(let attempt=0; attempt<2; attempt++){   // 抗限流：单次失败退避 400ms 重试一次
    const ctrl=new AbortController();
    const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} }, 9000);
    try{
      const r=await fetch(url, {signal:ctrl.signal});
      clearTimeout(to);
      if(!r.ok){ lastErr='HTTP'+r.status; if(attempt===0) await new Promise(rr=>setTimeout(rr,400)); continue; }
      const d=await r.json();
      if(!d || d.rc!==0 || !d.data || !d.data.klines || !d.data.klines.length) return null;
      const kl=d.data.klines.map(s=>{ const p=s.split(','); return {date:p[0], open:+p[1], close:+p[2], high:+p[3], low:+p[4], vol:+p[5]}; });
      return adjustSplits(kl);   // 东财 fqt=1 已前复权，再叠一层后复权兜底，防个别ETF拆分断崖
    }catch(e){ lastErr=e.message; clearTimeout(to); if(attempt===0) await new Promise(rr=>setTimeout(rr,400)); }
  }
  console.warn('东财K线兜底失败', secid, lastErr);
  return null;
}
async function loadEMKline(code){
  try{
    const sh=(code[0]==='6'||code[0]==='5');   // 5/6开头=沪市(secid=1.x)，其余深市(0.x)
    const kl=await fetchEMKline((sh?'1.':'0.')+code);
    return kl?adjustSplits(kl):null;
  }catch(e){ console.warn('东财K线兜底失败', code, e); return null; }
}
// 新浪JSONP兜底（腾讯+东财都挂时，沙箱IP常连不上东财，但新浪JSONP两端均可用，未复权但为真数据）
async function loadSinaKlineP(code){
  try{
    const kl=await loadKlineSina(code,'d',700);
    return (kl&&kl.length)?adjustSplits(kl):null;   // 新浪未复权，叠后复权兜底防拆分断崖
  }catch(e){ console.warn('新浪K线兜底失败', code, e); return null; }
}
function klinePct(kl, n){ if(!kl||kl.length<n+1) return null; const a=kl[kl.length-n-1].close, b=kl[kl.length-1].close; return (b-a)/a*100; }
function sectorLight(c){
  if(c.c60==null||c.c20==null) return {cls:'s-unknown', label:'数据不足', dot:'#bbb'};
  if(c.c60>0 && c.c20>0) return {cls:'s-up', label:'强趋势↑', dot:'#e23b3b'};
  if(c.c20>0 && c.c60<=0) return {cls:'s-rebound', label:'反弹↑', dot:'#e08a00'};
  if(Math.abs(c.c60)<5 && Math.abs(c.c20)<5) return {cls:'s-flat', label:'横盘→', dot:'#999'};
  return {cls:'s-down', label:'下跌↓', dot:'#1aa260'};
}
function sectorForecast(c, volCls, rel60, ind){
  // 多因子技术面强弱评分（非模型、零Key）：连续动量 + 趋势纯度(回归R²) + 技术指标共振(RSI/MACD/布林/乖离) + 量能 + 风险(波动/回撤) + 均值回归 → 综合分(仅描述当前技术面，不预测未来)
  if(c.c60==null||c.c20==null) return {cls:'s-unknown', label:'数据不足', conf:'', score:null, phase:''};
  const cl=clamp;
  const momMed=cl(c.c60,-25,25)/25, momShort=cl(c.c20,-15,15)/15, accel=cl(c.c5==null?0:c.c5,-10,10)/10, rel=cl(rel60==null?0:rel60,-20,20)/20;
  const upDir=(c.c60+c.c20)>0;
  let s = momMed*40 + momShort*25 + accel*12 + rel*8;
  let bull=2, agree=2, r2=0;
  if(ind){
    r2=ind.reg.r2;                       // 趋势纯度：回归R²*方向，干净趋势加分
    s += r2*(ind.reg.slope>0?1:-1)*12;
    bull=(ind.rsi>50?1:0)+(ind.macd.state==='bull'?1:0)+(ind.bb.pos>0.5?1:0)+(ind.bias>0?1:0);
    agree=upDir?bull:(4-bull);           // 技术指标与方向一致数(0~4)
    s += (agree-2)*4;
    if(ind.vol.ann>45) s-=6;              // 高波动=不确定性
    if(upDir && ind.mdd<-25) s-=4;       // 上行中深回撤=脆弱
  }
  s += ({'vol-up':8,'vol-flat':0,'vol-warn':-6,'vol-down':-8})[volCls]||0;
  let note='';
  if(c.c20>25){ s-=10; note='注意超买'; }
  if(c.c60<-25){ s+=6; note = note?note+'·超跌':'超跌企稳'; }
  s = cl(s,-100,100);
  let conf='中';
  if(ind){ if(agree>=4 && r2>0.6) conf='高'; else if(agree<=1) conf='低'; }
  let cls,label;
  if(s>=55){ cls='f-strong'; label='强势上行'; }
  else if(s>=35){ cls='f-strong'; label='偏强整理'; }
  else if(s>=15){ cls='f-warn'; label=momShort>=0?'上行动能放缓':'企稳反弹'; }
  else if(s>-15){ cls='f-flat'; label='横盘整理'; }
  else if(s>=-35){ cls='f-down'; label=momShort>=0?'冲高回落':'弱势下行'; }
  else { cls='f-down'; label='深度走弱'; }
  if(note) label+='·'+note;
  const phase=ind?classifyPhase(c,ind,upDir,volCls):'';
  return {cls:cls,label:label,conf:conf,score:Math.round(s),phase:phase};
}
/* 短期底部入场机会（描述性，不预测未来涨跌）
 * 仅刻画“当前技术形态是否呈现短期底部特征”，用于辅助观察，不构成任何买入建议。
 * 逻辑：先要求近期确实存在回调（前置条件），再统计若干底部/止跌信号是否共振。 */
function sectorBottom(c, ind){
  if(c.c5==null||c.c20==null||!ind) return {tier:0,label:'—',cls:'op-none'};
  const sig = {
    rsiLow:  ind.rsi!=null && ind.rsi<35,                                          // RSI进入超卖区
    bbLow:   ind.bb && ind.bb.pos!=null && ind.bb.pos<0.20,                         // 价格贴近布林下轨
    macdTurn:ind.macd && (ind.macd.state==='crossUp'||ind.macd.state==='bull'),     // 动量转强(DIF上穿DEA/已多头)
    decel:   c.c5 > c.c20 + 2,                                                     // 近5日优于近20日 → 跌速放缓/止跌
    biasLow: ind.bias!=null && ind.bias<-5,                                        // 价格显著偏离20日均线(超跌)
    volC:    ind.vol && ind.vol.regime==='contract'                                // 波动收缩(底部常见铺垫)
  };
  // 前置：近期确有回调，否则“底部”无从谈起
  const pullback = (c.c20<=-4) || (c.c60!=null && c.c60<=-6);
  if(!pullback) return {tier:0,label:'—',cls:'op-none'};
  let score = (sig.rsiLow?1:0)+(sig.bbLow?1:0)+(sig.macdTurn?1:0)+(sig.decel?1:0)+(sig.biasLow?1:0)+(sig.volC?1:0);
  if(ind.vol && ind.vol.ann!=null && ind.vol.ann>55) score=Math.min(score,1);     // 高波动下行途中“底”极不可靠 → 封顶关注
  let tier,cls,label;
  if(score>=3){ tier=3; cls='op-strong'; label='强底部信号'; }
  else { tier = score>=2?2:(score>=1?1:0); cls='op-none'; label = score>=1?'形态观察':'—'; }
  return {tier,label,cls,sig};
}
// 底部信号→中文标签（用于列内展示“具体亮了哪些信号”，纯描述现状、不喊抄底）
const BOTTOM_SIG_LABELS={rsiLow:'RSI超卖',bbLow:'布林下轨',macdTurn:'MACD转强',decel:'跌速放缓',biasLow:'超跌乖离',volC:'波动收缩'};
function bottomSigHTML(b){
  if(!b||!b.sig) return '';
  const sl=Object.keys(BOTTOM_SIG_LABELS).filter(k=>b.sig[k]).map(k=>BOTTOM_SIG_LABELS[k]);
  if(!sl.length) return '';
  return '<div class="op-sigs">'+sl.map(s=>'<span class="op-sig">'+s+'</span>').join('')+'</div>';
}
// 量价配合：近5日均量 vs 60日均量，结合涨跌方向判断量是助攻还是虚涨
function sectorVolume(kl, c20){
  if(!kl||kl.length<25) return {cls:'vol-flat', label:'量能平稳'};
  const n=kl.length;
  const avg=a=>{let s=0;for(const v of a)s+=v;return s/a.length;};
  const v5=avg(kl.slice(n-5).map(x=>x.volume));
  const v60=avg(kl.slice(Math.max(0,n-60)).map(x=>x.volume));
  const ratio=v60>0?v5/v60:1;
  if(c20>0 && ratio>=1.15) return {cls:'vol-up', label:'量价齐升'};
  if(c20>0 && ratio<0.85)  return {cls:'vol-warn', label:'缩量上涨'};
  if(c20<0 && ratio>=1.15) return {cls:'vol-down', label:'放量下跌'};
  if(c20<0 && ratio<0.85)  return {cls:'vol-flat', label:'缩量下跌'};
  return {cls:'vol-flat', label:'量能平稳'};
}
// ===== 行业预测·多因子统计内核（全部从已拉取的130根日K线计算，零Key） =====
function emaArr(arr,n){ const k=2/(n+1); const out=[]; let prev=arr[0]; for(let i=0;i<arr.length;i++){ prev=(i===0)?arr[0]:arr[i]*k+prev*(1-k); out.push(prev); } return out; }
// RSI(n)
function calcRSI(closes,n){ if(closes.length<=n) return 50; let g=0,l=0; for(let i=closes.length-n;i<closes.length;i++){ const d=closes[i]-closes[i-1]; if(d>=0)g+=d; else l-=d; } g/=n; l/=n; if(l===0) return 100; const rs=g/l; return 100-100/(1+rs); }
// MACD(12,26,9)：返回 DIF/DEA/柱 与状态(bull/bear/crossUp/crossDown)
function calcMacd(closes,fast,slow,sig){ fast=fast||12;slow=slow||26;sig=sig||9; const ef=emaArr(closes,fast),es=emaArr(closes,slow); const dif=ef.map((v,i)=>v-es[i]); const dea=emaArr(dif,sig); const hist=dif.map((v,i)=>(v-dea[i])*2); const i=dif.length-1; const st=(dif[i]>0&&hist[i]>0)?'bull':((dif[i]<0&&hist[i]<0)?'bear':(hist[i]>0?'crossUp':'crossDown')); return {dif:dif[i],dea:dea[i],hist:hist[i],state:st}; }
// 布林带(20,2)：返回位置 pos∈[0,1]（>0.8接近上轨,<0.2接近下轨）
function calcBoll(closes,n,k){ n=n||20;k=k||2; const w=closes.slice(closes.length-n); const mid=w.reduce((a,b)=>a+b,0)/n; const sd=Math.sqrt(w.reduce((a,b)=>a+(b-mid)*(b-mid),0)/n); const up=mid+k*sd,lo=mid-k*sd; const c=closes[closes.length-1]; return {mid,up,lo,pos:(up>lo)?(c-lo)/(up-lo):0.5}; }
// 乖离率 BIAS(20)：收盘价偏离20日均线的百分比
function calcBias(closes,n){ n=n||20; const w=closes.slice(closes.length-n); const ma=w.reduce((a,b)=>a+b,0)/n; return (closes[closes.length-1]-ma)/ma*100; }
// 线性回归（最小二乘）：斜率(每根K线变化)、窗口总涨幅slopePct、拟合优度R²（趋势纯度）
function linReg(arr){ const n=arr.length; if(n<3) return {slope:0,slopePct:0,r2:0}; let sx=0,sy=0,sxx=0,sxy=0; for(let i=0;i<n;i++){ sx+=i; sy+=arr[i]; sxx+=i*i; sxy+=i*arr[i]; } const d=n*sxx-sx*sx; if(d===0) return {slope:0,slopePct:0,r2:0}; const slope=(n*sxy-sx*sy)/d; const intercept=(sy-slope*sx)/n; const mean=sy/n; let ssTot=0,ssRes=0; for(let i=0;i<n;i++){ const yp=intercept+slope*i; ssRes+=(arr[i]-yp)**2; ssTot+=(arr[i]-mean)**2; } const r2=ssTot===0?0:1-ssRes/ssTot; return {slope, slopePct:slope/arr[0]*100, r2}; }
// 年化波动率 + 波动区间(regime：expand扩张/contract收缩/steady平稳)
function calcVol(closes){ const rets=[]; for(let i=1;i<closes.length;i++) rets.push((closes[i]-closes[i-1])/closes[i-1]); const mean=rets.reduce((a,b)=>a+b,0)/rets.length; const sd=Math.sqrt(rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/rets.length); const ann=sd*Math.sqrt(252)*100; const r=rets.slice(-20),l=rets.slice(-60); const mr=r.reduce((a,b)=>a+b,0)/r.length, ml=l.reduce((a,b)=>a+b,0)/l.length; const sdr=Math.sqrt(r.reduce((a,b)=>a+(b-mr)*(b-mr),0)/r.length); const sdl=Math.sqrt(l.reduce((a,b)=>a+(b-ml)*(b-ml),0)/l.length); const regime=(sdr>sdl*1.25)?'expand':((sdr<sdl*0.8)?'contract':'steady'); return {ann,regime}; }
// 窗口最大回撤%（负值）
function maxDrawdown(closes){ let peak=closes[0],mdd=0; for(const c of closes){ if(c>peak)peak=c; const dd=(c-peak)/peak; if(dd<mdd)mdd=dd; } return mdd*100; }
// ATR%：平均真实波幅 / 收盘
function calcATR(kl,n){ n=n||14; if(!kl||kl.length<n+1) return 0; const trs=[]; for(let i=1;i<kl.length;i++){ const h=kl[i].high,l=kl[i].low,pc=kl[i-1].close; trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))); } const atr=trs.slice(-n).reduce((a,b)=>a+b,0)/n; return atr/kl[kl.length-1].close*100; }
// 汇总一只ETF的全部技术因子
function computeSectorIndicators(kl){ if(!kl||kl.length<60) return null; const closes=kl.map(x=>x.close); const n=closes.length; return { rsi:calcRSI(closes,14), macd:calcMacd(closes), bb:calcBoll(closes,20,2), bias:calcBias(closes,20), reg:linReg(closes.slice(Math.max(0,n-60))), vol:calcVol(closes), mdd:maxDrawdown(closes.slice(Math.max(0,n-60))), atr:calcATR(kl) }; }
// 行情阶段分类（吸筹/拉升/派发/阴跌/横盘…）：结合方向+量能+RSI+乖离
function classifyPhase(c, ind, upDir, volCls){
  if(!ind) return '';
  if(Math.abs(c.c20)<8 && Math.abs(c.c60)<8 && ind.reg.r2<0.3) return '横盘整理';
  if(upDir && (volCls==='vol-warn'||volCls==='vol-down')) return '高位派发'; // 涨但量背离=派发
  if(upDir && c.c20>12 && ind.rsi>55) return '主升拉升';
  if(!upDir && c.c60<-10 && ind.rsi<45) return '震荡阴跌';
  if(c.c60<-22 && ind.rsi>=40) return '底部吸筹';
  if(c.c20>0 && c.c60<=0 && ind.rsi>45) return '筑底反弹';
  return upDir?'震荡偏强':'震荡偏弱';
}
// 综合强度分 0-100：中期动量40 + 近期加速度20 + 相对大盘20 + 量价配合20
function sectorScore(c, bench60, volCls){
  if(c.c60==null||c.c20==null) return null;
  const c5=c.c5==null?0:c.c5;
  const mono=(clamp(c.c60,-20,20)+20)/40*40;
  const acc =(clamp(c5,-10,10)+10)/20*20;
  const rel =(clamp(c.c60-(bench60==null?0:bench60),-20,20)+20)/40*20;
  const volMap={'vol-up':20,'vol-flat':12,'vol-warn':8,'vol-down':4};
  const vol=volMap[volCls]||12;
  return Math.round(mono+acc+rel+vol);
}
function scoreColor(s){
  if(s==null) return '#bbb';
  if(s>=70) return 'var(--up)';
  if(s>=50) return '#e08a00';
  if(s>=30) return '#999';
  return 'var(--down)';
}
// 自定义行业：localStorage 持久化，合并进扫描池
function loadCustomSectors(){
  try{ const a=JSON.parse(localStorage.getItem('sector_custom')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function saveCustomSectors(arr){ try{ localStorage.setItem('sector_custom', JSON.stringify(arr)); }catch(e){} }
function renderCustomList(){
  const box=$('scList'); if(!box) return;
  const arr=loadCustomSectors();
  box.innerHTML=arr.map((s,i)=>'<span class="sc-tag">'+s.name+' <b>'+s.code+'</b> <span class="sc-x" data-i="'+i+'">×</span></span>').join(' ');
  box.querySelectorAll('.sc-x').forEach(x=>x.onclick=()=>{
    const a=loadCustomSectors(); a.splice(+x.dataset.i,1); saveCustomSectors(a); renderCustomList(); renderSectors();
  });
}
function addCustomSector(){
  const code=($('scCode').value||'').trim(); const name=($('scName').value||'').trim();
  if(!/^\d{6}$/.test(code)){ alert('请输入 6 位 ETF 代码'); return; }
  const a=loadCustomSectors();
  if(a.some(s=>s.code===code)){ alert('该代码已在池中'); return; }
  a.push({name:name||code, code:code, etf:name||code}); saveCustomSectors(a);
  $('scCode').value=''; $('scName').value=''; renderCustomList(); renderSectors();
}
// 行业自选（localStorage）
function loadSectorWatch(){ try{ const a=JSON.parse(localStorage.getItem('sector_watch')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function saveSectorWatch(a){ try{ localStorage.setItem('sector_watch', JSON.stringify(a)); }catch(e){} }
function toggleSectorWatch(code){ const a=loadSectorWatch(); const i=a.indexOf(code); if(i>=0)a.splice(i,1); else a.push(code); saveSectorWatch(a); }
function loadSectorLast(){ try{ return JSON.parse(localStorage.getItem('sector_last')||'{}')||{}; }catch(e){ return {}; } }
function saveSectorLast(m){ try{ localStorage.setItem('sector_last', JSON.stringify(m)); }catch(e){} }
// 趋势反转检测：对比本次与上次扫描的趋势灯，统计转弱/转强（含自选高亮）
function detectReversal(rows){
  const last=loadSectorLast(); const cur={}; const watch=loadSectorWatch();
  let weak=0, strong=0, weakWatch=0, strongWatch=0;
  rows.forEach(r=>{ cur[r.code]=sectorLight(r).label; });
  if(Object.keys(last).length>0){
    const upSet=['强趋势↑','反弹↑'], downSet=['下跌↓','横盘→'];
    rows.forEach(r=>{
      const prev=last[r.code], now=cur[r.code];
      if(!prev||prev===now) return;
      const wasUp=upSet.indexOf(prev)>=0, nowUp=upSet.indexOf(now)>=0;
      const wasDown=downSet.indexOf(prev)>=0, nowDown=downSet.indexOf(now)>=0;
      if(wasUp&&nowDown){ weak++; if(watch.indexOf(r.code)>=0)weakWatch++; }
      else if(wasDown&&nowUp){ strong++; if(watch.indexOf(r.code)>=0)strongWatch++; }
    });
  }
  saveSectorLast(cur);
  return {weak:weak, strong:strong, weakWatch:weakWatch, strongWatch:strongWatch};
}
// 导出：复制文本/CSV 到剪贴板
function exportSectorText(){
  const box=$('sectorsBody'); if(!box||!box.querySelector('table.sectors')){ alert('请先扫描'); return; }
  let txt='行业趋势扫描 @ '+new Date().toLocaleString()+'\n';
  txt+='行业\t代表ETF\t当日%\t20日%\t60日%\t趋势\t技术面状态\t技术强弱分\t量能\n';
  box.querySelectorAll('tr[data-code]').forEach(tr=>{
    const td=tr.querySelectorAll('td'); const g=i=>(td[i]?td[i].textContent.replace(/\s+/g,' ').trim():'');
    txt+=[g(1),g(2),g(3),g(4),g(5),g(6),g(7),g(8),g(9)].join('\t')+'\n';
  });
  try{ navigator.clipboard.writeText(txt); alert('已复制文本到剪贴板，可粘贴到微信/记事本'); }
  catch(e){
    const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); alert('已复制文本'); }catch(_){ prompt('复制下列文本:', txt); }
    document.body.removeChild(ta);
  }
}
// 导出：canvas 手绘表格图片（零 Key 不依赖外部库）
function exportSectorImage(){
  const box=$('sectorsBody'); if(!box||!box.querySelector('table.sectors')){ alert('请先扫描'); return; }
  const rowsData=[];
  box.querySelectorAll('tr[data-code]').forEach(tr=>{ const td=tr.querySelectorAll('td'); const g=i=>(td[i]?td[i].textContent.replace(/\s+/g,' ').trim():''); const bt=td[10]; const bl=bt?(bt.querySelector('.op-tag')?bt.querySelector('.op-tag').textContent.trim():bt.textContent.replace(/\s+/g,' ').trim()):''; rowsData.push([g(1),g(2),g(3),g(4),g(5),g(6),g(7),g(8),g(9),bl]); });
  const head=['行业','代表ETF','当日%','20日%','60日%','趋势','技术面状态','技术强弱分','量能','短期底部入场机会'];
  const cw=[86,104,62,62,62,76,96,76,76,112], ch=26, pad=10;
  const W=pad*2+cw.reduce((a,b)=>a+b,0), H=pad*2+ch*(rowsData.length+1);
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const ctx=cv.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#f3f4f6'; ctx.fillRect(pad,pad,cw.reduce((a,b)=>a+b,0),ch);
  ctx.font='12px sans-serif'; ctx.textBaseline='middle';
  const drawRow=(arr,y)=>{ let x=pad; arr.forEach((t,i)=>{ ctx.fillStyle='#222'; ctx.fillText(String(t),x+4,y+ch/2); x+=cw[i]; }); };
  drawRow(head,pad);
  rowsData.forEach((r,i)=>{ if(i%2===1){ ctx.fillStyle='#fafafa'; ctx.fillRect(pad,pad+ch*(i+1),cw.reduce((a,b)=>a+b,0),ch); } drawRow(r,pad+ch*(i+1)); });
  try{ const url=cv.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download='行业趋势扫描.png'; a.click(); alert('已导出图片（行业趋势扫描.png）'); }
  catch(e){ alert('导出图片失败：'+e.message); }
}

/* ============ 技术面强弱评分（仅描述当前技术形态，不预测未来） ============
 * 原「本地滚动校准→上涨概率」模块已移除：经 6 年（2020–2026，≈4.9 万样本）walk-forward
 * 回测验证，综合分对未来约 20 日涨跌几乎无预测力（全样本 AUC≈0.49，各分年度 AUC 均<0.5）。
 * 继续把分数映射成「概率%」会误导用户，故本页只展示技术强弱分与形态标签。
 */

async function renderSectors(){
  const box=$('sectorsBody'); if(!box) return;
  const POOL = INDUSTRY_POOL.concat(loadCustomSectors());
  box.innerHTML='<div class="empty">正在扫描 '+POOL.length+' 个行业 ETF 的实时行情与K线（约数秒）…</div>';
  // 当日涨跌：腾讯批量行情（零Key、CORS友好）
  let quotes={};
  try{
    const ctrl=new AbortController();
    const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} }, 8000);
    const qtCodes=POOL.map(x=>normCode(x.code));
    const r=await fetch('https://qt.gtimg.cn/q='+qtCodes.join(',')+'&_='+Date.now(), {signal:ctrl.signal});
    clearTimeout(to);
    const buf=await r.arrayBuffer();
    const txt=new TextDecoder('gb18030').decode(buf);
    quotes=parseTencent(txt);
  }catch(e){ console.warn('sector quotes failed', e); }
  // 相对大盘强度基准：沪深300 日K线（腾讯前复权，零Key）
  let bench60=null;
  try{
    let bk=await loadKlineP('sh000300','d');
    if(!(bk&&bk.length)) bk=await fetchEMKline('1.000300');   // 沪深300沪市，腾讯挂时东财兜底
    if(!(bk&&bk.length)) bk=await loadSinaKlineP('sh000300');   // 东财也挂(沙箱IP常被挡) → 新浪兜底
    bench60=bk?klinePct(bk,60):null;
  }catch(e){ console.warn('bench failed', e); }
  // 每只 ETF 拉日K线算 5/20/60 日涨幅 + 量价配合（腾讯前复权，零Key）
  state._demoCodes = new Set();   // 本次扫描中连不上的行业（用于醒目横幅）
  const rows=await Promise.all(POOL.map(async x=>{
    let kl=await loadKlineP(x.code,'d');
    if(!(kl&&kl.length)) kl=await loadEMKline(x.code);   // 腾讯fqkline被WAF/限流连不上 → 东财兜底
    if(!(kl&&kl.length)) kl=await loadSinaKlineP(x.code);   // 东财也挂(沙箱IP常被挡) → 新浪兜底
    const q=quotes[normCode(x.code)]||{};
    const klMiss = !kl;
    const c5=klinePct(kl,5), c20=klinePct(kl,20), c60=klinePct(kl,60);
    const vol=klMiss?{cls:'vol-flat',label:'连不上'}:sectorVolume(kl, c20);
    return { name:x.name, code:x.code, etf:x.etf, day:(q.changePct==null?null:(q.changePct||0)), c5:c5, c20:c20, c60:c60, vol:vol, ind:computeSectorIndicators(kl), rel60:(c60==null||bench60==null)?null:(c60-bench60), score:null, phase:'', _kl:kl, klMiss:klMiss };
  }));
  rows.forEach(r=>{ r._F=sectorForecast(r, r.vol.cls, r.rel60, r.ind); r._B=sectorBottom(r, r.ind); });
  // 连不上清单（用于醒目横幅，绝不显示假数据）
  const demoFails = rows.filter(r=>r.klMiss).map(r=>r.name);
  let demoWarn='';
  if(demoFails.length){
    const head = demoFails.slice(0,8).join('、') + (demoFails.length>8?' 等':'');
    demoWarn='<div class="demo-warn">⚠️ 行情接口连不上：'+demoFails.length+' 个行业（'+head+'）无法获取真实K线，<b>已隐藏其假数据</b>，表中标灰行为「连不上」。当日% 若正常显示则为真实行情，<b>请勿参考其趋势列</b>。请检查网络后点「重新扫描」。</div>';
  }
  // 注：原「滚动自适应校准→上涨概率」已移除（回测证实综合分对未来涨跌近无预测力），本页不再输出概率。
  // 排序：技术强弱分降序（数据不足排最后）
  rows.sort((a,b)=>{ const va=a._F.score==null?-1e9:a._F.score, vb=b._F.score==null?-1e9:b._F.score; return vb-va; });
  // —— 市况(regime)检测 + 验证过的分状态规律 → 顶部解读条 + 行内徽章 ——
  const regime=(bench60==null)?'unknown':(bench60>5?'bull':(bench60<-5?'bear':'flat'));
  let regimeBanner='';
  if(regime!=='unknown'){
    const pctB=(bench60>=0?'+':'')+bench60.toFixed(1)+'%';
    const txt = regime==='bull'
      ? '🟢 <b>牛市市况</b>（沪深300 近60日 '+pctB+'）：验证显示「低波动行业相对占优」——表内 🛡 标记当前波动最小的行业，强势行情里它们往往更抗回撤。'
      : regime==='bear'
      ? '🔴 <b>熊市市况</b>（沪深300 近60日 '+pctB+'）：验证显示「动量大概率反转」——近期最强易补跌、最弱易反弹，表内 ↩ 标记近期最弱行业（历史易反弹），勿追高。'
      : '🟡 <b>震荡市况</b>（沪深300 近60日 '+pctB+'）：中线动量微弱且样本外不稳定，<b>无可靠规律，仅作参考、勿据此调仓</b>。';
    regimeBanner='<div class="regime-banner '+regime+'">'+txt+'</div>';
  }
  // 徽章阈值：当前市况下占优的那一类取前 25%
  if(regime==='bull'||regime==='bear'){
    const vols=rows.filter(r=>r.ind&&r.ind.vol&&r.ind.vol.ann!=null).map(r=>r.ind.vol.ann).sort((a,b)=>a-b);
    const moms=rows.filter(r=>r.c60!=null).map(r=>r.c60).sort((a,b)=>a-b);
    const lowVolMax=vols.length?vols[Math.floor(vols.length*0.25)]:null;
    const weakMax=moms.length?moms[Math.floor(moms.length*0.25)]:null;
    for(const r of rows){
      if(regime==='bull'&&r.ind&&r.ind.vol&&r.ind.vol.ann!=null&&lowVolMax!=null&&r.ind.vol.ann<=lowVolMax) r._badge='🛡低波优选';
      else if(regime==='bear'&&r.c60!=null&&weakMax!=null&&r.c60<=weakMax) r._badge='↩超跌反弹候选';
      else r._badge='';
    }
  } else { for(const r of rows) r._badge=''; }
  const head='<thead><tr><th>#</th><th>行业</th><th>代表ETF</th><th>当日%</th><th>20日%</th><th>60日%</th><th>趋势</th><th>技术面状态</th><th>技术强弱分</th><th>量能</th><th title="描述性技术形态判断（RSI超卖/布林下轨/MACD转强/跌速放缓/超跌/波动收缩共振）。仅当≥3个信号共振标记为「强底部信号」——历史回测显示其之后20日有微弱超额(~+1%、胜率约54%，统计显著)，本质为跌多短期均值回归。其余仅标「形态观察」，不构成可靠底部判断，更不构成买入建议。">短期底部入场机会</th></tr></thead>';
  const watchSet=new Set(loadSectorWatch());
  const body=rows.map((r,i)=>{
    const miss=r.klMiss;
    const L=miss?{cls:'s-unknown',label:'连不上',dot:'#bbb'}:sectorLight(r);
    const F=miss?{cls:'s-unknown',label:'连不上',conf:''}:r._F;
    r.phase=miss?'':F.phase;
    delete r._kl;
    const confDot=(F.conf)?'<span class="conf-dot conf-'+F.conf+'" title="信号一致度：'+F.conf+'"></span>':'';
    const dayCls=r.day==null?'':(r.day>=0?'up':'down');
    const day=r.day==null?'--':(r.day>=0?'+':'')+r.day.toFixed(2)+'%';
    const c20=r.c20==null?'--':(r.c20>=0?'+':'')+r.c20.toFixed(2)+'%';
    const c60=r.c60==null?'--':(r.c60>=0?'+':'')+r.c60.toFixed(2)+'%';
    const c20Cls=r.c20==null?'':(r.c20>=0?'up':'down');
    const c60Cls=r.c60==null?'':(r.c60>=0?'up':'down');
    const sc=scoreColor(F.score);
    const scoreTxt=F.score==null?'—':F.score;
    const volCell=miss?'<td>—</td>':'<td><span class="vol-tag '+r.vol.cls+'">'+r.vol.label+'</span></td>';
    const b=r._B||{cls:'op-none',label:'—'};
    const botInner=miss?'—':'<span class="op-tag '+b.cls+'">'+b.label+'</span>'+(b.tier>=1?bottomSigHTML(b):'');
    const botCell='<td>'+botInner+'</td>';
    return '<tr data-code="'+r.code+'"'+(miss?' class="row-miss"':'')+'>'
      +'<td><span class="rank">'+(i+1)+'</span></td>'
      +'<td><span class="star '+(watchSet.has(r.code)?'on':'')+'" data-code="'+r.code+'">★</span>'+r.name+(r._badge?' <span class="regime-badge '+regime+'">'+r._badge+'</span>':'')+'</td><td>'+r.etf+' <span class="cd" style="font-size:11px;color:var(--sub);">'+r.code+'</span></td>'
      +'<td class="'+dayCls+'">'+day+'</td>'
      +'<td class="'+c20Cls+'">'+c20+'</td>'
      +'<td class="'+c60Cls+'">'+c60+'</td>'
      +'<td class="'+L.cls+'"><span class="s-light" style="background:'+L.dot+'"></span>'+L.label+'</td>'
      +'<td class="'+F.cls+'">'+confDot+F.label+(F.phase?' <span class="phase">'+F.phase+'</span>':'')+'</td>'
      +'<td class="prob-cell conf-'+(F.conf||'')+'" style="color:'+sc+';">'+scoreTxt+'</td>'+volCell+botCell+'</tr>';
  }).join('');
  $('sectorsBanner').innerHTML=demoWarn+regimeBanner;
  box.innerHTML='<table class="sectors">'+head+'<tbody>'+body+'</tbody></table>'
    +'<div class="sectors-note">「短期底部入场机会」为<b>描述性</b>技术形态判断（RSI超卖 / 布林下轨 / MACD转强 / 跌速放缓 等信号共振），<b>不预测未来涨跌</b>。仅「<b>强底部信号</b>」(≥3个信号共振)经真实数据回测有微弱超额（之后20日约+1%、胜率约54%，统计显著），属跌多短期均值回归；其余仅标「形态观察」，<b>不构成可靠底部判断，更不构成买入建议</b>。高波动下行途中的“底”极不可靠，已自动降级。</div>';
  const rev=detectReversal(rows);
  const al=$('sectorAlert');
  if(al){
    if(rev.weak+rev.strong>0){ al.textContent='⚠ 本周期 '+(rev.weak+rev.strong)+' 个行业趋势反转（'+rev.weak+' 转弱 / '+rev.strong+' 转强）'+((rev.weakWatch+rev.strongWatch)>0?('，其中 '+(rev.weakWatch+rev.strongWatch)+' 个为你自选'):''); al.className='alert warn'; }
    else { al.textContent='✓ 本周期无趋势反转'; al.className='alert ok'; }
  }
  $('sectorTime').textContent='更新 '+ts();
  box.querySelectorAll('.star').forEach(s=>s.onclick=(e)=>{ e.stopPropagation(); toggleSectorWatch(s.dataset.code); s.classList.toggle('on'); });
  box.querySelectorAll('tr[data-code]').forEach(tr=>tr.onclick=()=>{
    const code=normCode(tr.dataset.code)||tr.dataset.code; // 用加前缀的码，与全站统一，避免自选里混入裸码导致 selectCode 失配
    if(!state.watch.some(w=>w.code===code)){ state.watch.push({code:code, kind:'stock', name:''}); save(); renderWatch(); }
    selectCode(code);
    document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('on', n.dataset.view==='market'));
    showView('market');
  });
}

