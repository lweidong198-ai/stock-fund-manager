/* =========================================================================
 * analysis.js
 * 模块来源小节：建仓分析：集合投资大师思维框架 / 建仓分析引擎 v2：多因子 · 环境感知 · 置信加权 · 冲突调和 / 建仓分析：按当前持仓汇总研判
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 建仓分析：集合投资大师思维框架 ============ */
function last(a){ if(!a) return null; for(let i=a.length-1;i>=0;i--) if(a[i]!=null) return a[i]; return null; }
function sig(s,r){ return {signal:s, reason:r}; }

// 统一序列：股票用日K、基金用累计净值
function getSeries(code){
  const w=state.watch.find(x=>x.code===code);
  if(w&&w.kind==='fund'){
    const fd=state.fundData[code];
    if(!fd||!fd.cum||!fd.cum.length) return null;
    const arr=fd.cum;
    return {type:'fund', closes:arr.map(p=>p.nav), highs:arr.map(p=>p.nav), lows:arr.map(p=>p.nav), vols:null};
  }
  const kl=state.kcache[code+'d'];
  if(!kl||!kl.length) return null;
  return {type:'stock', closes:kl.map(x=>x.close), highs:kl.map(x=>x.high), lows:kl.map(x=>x.low), vols:kl.map(x=>x.vol)};
}

// 7 位大师：各自用一套「买不买」的逻辑，套在同样的指标上


/* ============ 建仓分析引擎 v2：多因子 · 环境感知 · 置信加权 · 冲突调和 ============ */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// ===== 统计工具（机会精选三因子回测用，零Key、纯前端） =====
function mean(a){ return a.length? a.reduce((x,y)=>x+y,0)/a.length : 0; }
function std(a){ if(a.length<2) return 0; const m=mean(a); return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/(a.length-1)); }
function rank(arr){ const idx=arr.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]); const r=new Array(arr.length); let i=0; while(i<idx.length){ let j=i; while(j<idx.length-1 && idx[j+1][0]===idx[i][0]) j++; const avg=(i+j)/2+1; for(let k=i;k<=j;k++) r[idx[k][1]]=avg; i=j+1; } return r; }
function spearman(a,b){ if(a.length!==b.length||!a.length) return 0; const ra=rank(a), rb=rank(b); const n=a.length; const ma=mean(ra), mb=mean(rb); let cov=0,va=0,vb=0; for(let i=0;i<n;i++){ cov+=(ra[i]-ma)*(rb[i]-mb); va+=(ra[i]-ma)**2; vb+=(ra[i]-mb)**2; } return (va===0||vb===0)?0:cov/Math.sqrt(va*vb); }
function zscore(arr){ const m=mean(arr), s=std(arr); return arr.map(x=> s===0?0:(x-m)/s); }
const toSig=s=> s>=30?'看多': s<=-30?'看空':'中性';

/* 多因子打分器：parts=[{w,val,txt}]，val∈[-100,100]
   返回 {score(-100~100), confidence(0~1), reason(取|val|最大的3条，天然"缜密"可追溯)} */
function scoreOf(parts){
  let s=0,wsum=0,strong=0;
  parts.forEach(p=>{ s+=p.val*p.w; wsum+=p.w; if(Math.abs(p.val)>50) strong++; });
  const score=Math.round(wsum? s/wsum : 0);
  const confidence=+clamp(0.12+0.55*Math.abs(score)/100+0.3*Math.min(1,strong/2),0.05,1).toFixed(2);
  const reason=parts.slice().sort((a,b)=>Math.abs(b.val)-Math.abs(a.val)).slice(0,3).map(p=>p.txt).join('；');
  return {score,confidence,reason};
}

/* —— 通用因子（所有大师共享，保证口径一致、逻辑缜密）—— */
function fValue(M){ // 估值便宜度：价格越低/离均值越远越便宜 → 越正
  let v=0;
  if(M.maBias<-8)v+=35; else if(M.maBias<2)v+=18; else if(M.maBias>18)v-=35; else if(M.maBias>8)v-=18;
  if(M.drawdown>0.2)v+=30; else if(M.drawdown>0.08)v+=15;
  if(M.pricePos<0.25)v+=20; else if(M.pricePos<0.45)v+=8; else if(M.pricePos>0.85)v-=25; else if(M.pricePos>0.7)v-=10;
  return clamp(v,-100,100);
}
function fTrend(M){ // 趋势：多头正、空头负，强度由均线斜率决定
  if(M.regime==='bull') return clamp(40+M.trendStrength*40,-100,100);
  if(M.regime==='bear') return clamp(-40-M.trendStrength*40,-100,100);
  return clamp((M.trendStrength||0)*25,-45,45);
}
function fMom(M){ // 动能：MACD红柱+放量+非超买 → 正
  let v=0;
  if(M.macd.bar>0 && M.macd.dif>M.macd.dea)v+=35; else if(M.macd.bar<0)v-=30;
  if(M.rsi6<78 && M.rsi6>20)v+=10; else if(M.rsi6>=78)v-=15;
  if(M.volRatio>1.3 && M.nowP>M.ma20)v+=18; else if(M.volRatio<0.7)v-=8;
  return clamp(v,-100,100);
}
function fVol(M){ // 波动：平稳可加仓，高波动需谨慎
  if(M.volRegime==='calm')return 35;
  if(M.volRegime==='high')return -45;
  return -5;
}
function fContra(M){ // 逆向：恐慌(非熊)看多、贪婪看空；熊市恐慌降级(防接飞刀)
  if(M.momState==='oversold' && M.regime!=='bear')return 70;
  if(M.momState==='oversold' && M.regime==='bear')return 22;
  if(M.momState==='overbought')return -70;
  return 0;
}
function fRisk(M){ // 风险严重度：0~-100
  let v=0;
  if(M.volRegime==='high')v-=35;
  if(M.drawdown>0.25)v-=30;
  if(M.rsi6>90||M.rsi6<8)v-=20;
  if(M.ma5<M.ma20 && M.nowP<M.ma20)v-=15;
  return clamp(v,-100,0);
}

const MASTERS = [
  { key:'buffett', name:'沃伦·巴菲特', tag:'价值投资·长期持有', cat:'value',
    thesis:'好生意+好价格：趋势完好且没被爆炒时，于合理估值分批买入，绝不追高。',
    judge:(M)=>scoreOf([
      {w:1.1, val:fValue(M), txt:'估值层面：'+(M.maBias<0?('现价低于20日均线'+(-M.maBias).toFixed(0)+'%(不贵)'):M.maBias>15?('现价高出20日均线'+M.maBias.toFixed(0)+'%(偏贵)'):('价格接近均线'))},
      {w:0.9, val:fTrend(M), txt:'趋势层面：'+(M.regime==='bull'?'均线多头、结构向上(上涨趋势完好)':M.regime==='bear'?'均线空头(趋势向下)':'横盘震荡')},
      {w:0.6, val:M.momState==='overbought'?-55:M.momState==='oversold'?25:0, txt:'情绪护栏：'+(M.momState==='overbought'?'已处超买区，不追高':M.momState==='oversold'?'已超卖但需防价值陷阱':'情绪未极端')},
    ])},
  { key:'graham', name:'本杰明·格雷厄姆', tag:'安全边际', cat:'value',
    thesis:'买入价要明显低于"真实价值"，留足安全空间；下行趋势里即便便宜也可能更便宜。',
    judge:(M)=>scoreOf([
      {w:1.3, val:fValue(M), txt:'安全边际：'+(M.drawdown>0.15?('较近60日高点回撤'+((M.drawdown*100).toFixed(0))+'%，价格更便宜、空间更厚'):('回撤有限，安全空间一般'))},
      {w:0.7, val:fRisk(M)*0.6, txt:'风险垫：'+(M.volRegime==='high'?'波动放大需更厚安全垫':'波动可控')},
      {w:0.5, val:M.regime==='bear'?-25:0, txt:'环境：'+(M.regime==='bear'?'下行趋势中便宜货可能更便宜，谨慎':'非熊市，便宜即是机会')},
    ])},
  { key:'lynch', name:'彼得·林奇', tag:'成长与价格匹配', cat:'momentum',
    thesis:'买动能向上、成长性与价格配合的公司；量价齐升才进攻，涨太猛则等回踩。',
    judge:(M)=>scoreOf([
      {w:1.0, val:fMom(M), txt:'动能：'+(M.macd.bar>0 && M.macd.dif>M.macd.dea?'MACD红柱、快线在慢线上方(上涨劲头足)':'动能不足')},
      {w:0.8, val:M.volRatio>1.2 && M.trend!=='bear'?20:-10, txt:'量价：'+(M.volRatio>1.2?'放量配合上攻':'量能平淡')},
      {w:0.5, val:M.momState==='overbought'?-50:0, txt:'护栏：'+(M.momState==='overbought'?'涨太猛，等回踩':'未过热')},
    ])},
  { key:'soros', name:'乔治·索罗斯', tag:'趋势反身性', cat:'momentum',
    thesis:'顺着被自我强化的趋势走，找准转折点；不参与"会不会反弹"的赌注。',
    judge:(M)=>scoreOf([
      {w:1.1, val:fTrend(M), txt:'反身性：'+(M.regime==='bull' && M.newHigh?'趋势自我强化、创新高(顺势)':M.regime==='bear'?'趋势反身向下(撤离)':'趋势未明')},
      {w:0.7, val:M.macd.bar>0?25:-25, txt:'拐点：'+(M.macd.bar>0?'动能未反转':'动能转负，警惕转折')},
    ])},
  { key:'livermore', name:'杰西·利弗莫尔', tag:'关键点突破', cat:'trend',
    thesis:'只在价格放量突破关键位置买入；跌破关键均线支撑则离场，不犹豫。',
    judge:(M)=>scoreOf([
      {w:1.1, val:(M.newHigh && M.volRatio>1.2 && M.regime==='bull')?75:(M.ma5<M.ma20 && M.nowP<M.ma20)?-70:5, txt:'关键点：'+(M.newHigh && M.volRatio>1.2 && M.regime==='bull'?'放量创新高=突破买点':(M.ma5<M.ma20 && M.nowP<M.ma20)?'跌破均线=破位卖出':'无明确突破/破位')},
      {w:0.6, val:fTrend(M), txt:'结构：'+(M.regime==='bull'?'上行结构完好':'结构偏弱')},
    ])},
  { key:'dalio', name:'瑞·达里奥', tag:'全天候·控风险', cat:'risk',
    thesis:'看波动大小决定节奏：波动小适合分批建仓，波动大则收紧仓位等环境更稳。',
    judge:(M)=>scoreOf([
      {w:1.0, val:fVol(M), txt:'波动：'+(M.volRegime==='calm'?'布林收窄、市场安稳(可分批)':M.volRegime==='high'?'波动炸开(控仓)':'波动中性')},
      {w:0.8, val:fRisk(M), txt:'风险预算：'+(M.drawdown>0.2?'回撤已大，收紧':'回撤可控')},
      {w:0.5, val:M.regime==='bear'?-25:10, txt:'环境：'+(M.regime==='bear'?'熊市降风险敞口':'非熊市可适度')},
    ])},
  { key:'munger', name:'查理·芒格', tag:'逆向·避免蠢事', cat:'contrarian',
    thesis:'反过来想：先躲开明显糟糕的；不买看不懂的，不在极度贪婪时出手。',
    judge:(M)=>scoreOf([
      {w:1.1, val:fContra(M), txt:'逆向：'+(M.momState==='oversold'?'极度恐慌，逆向可能是机会':M.momState==='overbought'?'极度贪婪，避开':'情绪中性')},
      {w:0.6, val:fRisk(M)*0.5, txt:'防雷：'+(M.rsi6>88?'明显过热信号':'未见极端')},
    ])},
  { key:'feargreed', name:'恐慌贪婪先生', tag:'市场情绪·逆向', cat:'contrarian',
    thesis:'用市场"害怕还是贪婪"当指南：大众恐慌我贪婪，大众贪婪我恐惧，且熊市抄底更谨慎。',
    judge:(M)=>scoreOf([
      {w:1.0, val:fContra(M), txt:'情绪钟摆：'+(M.momState==='oversold'?'大众恐慌我贪婪':M.momState==='overbought'?'大众贪婪我恐惧':'情绪居中')},
      {w:0.7, val:M.regime==='bear'?(M.momState==='oversold'?10:-20):(M.momState==='oversold'?20:0), txt:'结合趋势：'+(M.regime==='bear'?'熊市抄底需更谨慎':'非熊市逆向胜率更高')},
    ])},
  { key:'northflow', name:'北向资金观察员', tag:'聪明钱流向', cat:'momentum',
    thesis:'跟着"聪明钱"走：放量+上行+高位是进场扫货信号；缩量下行则撤离。',
    judge:(M)=>scoreOf([
      {w:1.0, val:(M.volRatio>1.25 && M.regime==='bull' && M.pricePos>0.5)?70:(M.volRatio<0.8 && M.regime==='bear')?-60:0, txt:'聪明钱：'+(M.volRatio>1.25 && M.regime==='bull'?'放量+上行+高位=资金进场':'缩量下行=资金撤离')},
      {w:0.6, val:fMom(M), txt:'动能配合：'+(M.macd.bar>0?'动能正':'动能负')},
    ])},
  { key:'position', name:'仓位管理师', tag:'买几成仓·风控', cat:'risk',
    thesis:'不算"买不买"，而算"该下几成仓"：环境越稳越能多买，越乱越要少买。',
    judge:(M)=>{
      const base = fVol(M)*0.5 + fRisk(M)*0.5 + (M.regime==='bull'?20:M.regime==='bear'?-30:0);
      const lvl = base>40?'7~8成':base>10?'5~6成':base<-10?'2~3成或空仓':'4~5成';
      return scoreOf([
        {w:1.0, val:clamp(base,-100,100), txt:'仓位建议：当前环境'+lvl+'（波动'+(M.volRegime==='high'?'大':'小')+'、趋势'+(M.regime==='bear'?'向下':'向上/平')+'）'},
        {w:0.7, val:fRisk(M), txt:'风控：'+(M.drawdown>0.2?'已有较大回撤，控仓保命':'回撤可控')},
      ]);
    }},
  { key:'blackswan', name:'黑天鹅预警员', tag:'极端风险·避险', cat:'risk',
    thesis:'专门盯"会不会出大事"：波动突然炸开、或短时间暴跌，先拉警报减仓保命。',
    judge:(M)=>scoreOf([
      {w:1.2, val:fRisk(M), txt:'极端风险：'+(M.volRegime==='high'?'波动剧烈，黑天鹅概率升':'波动正常')+(M.rsi6>90||M.rsi6<8?' 且RSI极端':'')},
      {w:0.6, val:M.drawdown>0.3?-40:0, txt:'崩盘监测：'+(M.drawdown>0.3?('已从高点跌'+((M.drawdown*100).toFixed(0))+'%，警惕继续'):'未见深跌')},
    ])},
  { key:'dca', name:'定投派', tag:'长线·不择时', cat:'value',
    thesis:'不猜涨跌，固定时间买固定金额，靠"跌了多买份额"摊低成本；只在极端高位缓一缓。',
    judge:(M)=>scoreOf([
      {w:0.9, val:M.pricePos>0.92?-30:35, txt:'定投纪律：'+(M.pricePos>0.92?'现价在近60日高位，缓一缓再扣款(别买在尖顶)':'不择时，当前即可开始，跌了多攒份额')},
      {w:0.5, val:fValue(M)*0.3, txt:'估值：'+(M.maBias<0?'当前偏低更利于摊低成本':'当前不便宜但定投无妨')},
    ])},
  { key:'trap', name:'价值陷阱猎人', tag:'排雷·防假便宜', cat:'value',
    thesis:'专躲"看着便宜其实是坑"：低位但阴跌+非超卖=真烂货；低位企稳+接近超卖=真便宜。',
    judge:(M)=>scoreOf([
      {w:1.0, val:(M.pricePos<0.3 && M.regime==='bear' && M.rsi6>35)?-65:(M.pricePos<0.35 && M.newLow===false && M.rsi6<40)?55:0, txt:'排雷：'+(M.pricePos<0.3 && M.regime==='bear' && M.rsi6>35?'低位但阴跌+非超卖=价值陷阱(不捡)':'低位企稳+接近超卖=真便宜(可捡)')},
      {w:0.6, val:fValue(M), txt:'估值：'+(M.maBias<0?'价格低于均线':'价格高于均线')},
    ])},
];

/* 环境识别 + 评分聚合（与 UI 解耦，便于测试直接注入 M） */
function analyzeWith(M, code){
  const raw = MASTERS.map(mt=>{ const j=mt.judge(M); return {mt, ...j}; });
  // 按市场环境对不同流派加权：牛市抬动量/趋势，熊市抬价值/逆向/风控
  const regimeW = ({
    bull:{value:0.95, momentum:1.25, trend:1.15, contrarian:0.85, risk:0.85},
    bear:{value:1.20, momentum:0.80, trend:0.90, contrarian:1.15, risk:1.25},
    side:{value:1.00, momentum:1.00, trend:1.00, contrarian:1.00, risk:1.00}
  })[M.regime] || {value:1,momentum:1,trend:1,contrarian:1,risk:1};
  let wsum=0, wscore=0, confSum=0;
  raw.forEach(r=>{
    const w = regimeW[r.mt.cat] || 1;
    const c = Math.max(0.05, r.confidence);
    wscore += r.score * c * w;
    wsum   += c * w;
    confSum += r.confidence;
  });
  const composite = wsum ? Math.round(wscore/wsum) : 0;   // -100~100 综合评分
  const avgConf = raw.length ? confSum/raw.length : 0;
  const scores = raw.map(r=>r.score);
  const std = Math.sqrt(scores.reduce((a,s)=>a+(s-composite)*(s-composite),0)/scores.length);
  const conf = +clamp(avgConf*(1-Math.min(0.5, std/120)), 0.05, 1).toFixed(2); // 分歧大则降置信
  const hardDanger = (M.momState==='overbought' && M.regime!=='bull') ||
                     (M.regime==='bear' && M.ma5<M.ma20 && M.nowP<M.ma60*0.97);
  let bull=0, neutral=0, bear=0; const results=[];
  raw.forEach(r=>{
    const signal = toSig(r.score);
    if(signal==='看多')bull++; else if(signal==='看空')bear++; else neutral++;
    results.push({name:r.mt.name, tag:r.mt.tag, thesis:r.mt.thesis, signal, reason:r.reason, score:r.score, confidence:r.confidence});
  });
  const cp = composite>=0?'+':''; const confPct=Math.round(conf*100);
  let verdict, vclass;
  if(hardDanger && composite>0){ verdict='🟡 反弹非追高区·谨慎小仓（综合'+cp+composite+'·置信'+confPct+'%）'; vclass='v-mid'; }
  else if(composite>=35 && !hardDanger){ verdict='✅ 适合建仓·分批买入（综合'+cp+composite+'·置信'+confPct+'%）'; vclass='v-good'; }
  else if(composite>=12){ verdict='🟡 偏积极·可小仓试探（综合'+cp+composite+'·置信'+confPct+'%）'; vclass='v-mid'; }
  else if(composite<=-12){ verdict='🔴 暂缓或回避·先别急（综合'+cp+composite+'·置信'+confPct+'%）'; vclass='v-bad'; }
  else { verdict='⚪ 信号中性·再等等（综合'+cp+composite+'·置信'+confPct+'%）'; vclass='v-flat'; }
  const risks=[];
  if(M.pricePos>0.85) risks.push('价格处近60日高位约'+(M.pricePos*100).toFixed(0)+'%，追高风险大');
  if(M.rsi6>80) risks.push('RSI6='+M.rsi6.toFixed(0)+'，短期涨太猛，回调概率大');
  if(M.regime==='bear') risks.push('均线空头排列，整体趋势向下');
  if(M.maBias>10) risks.push('现价偏离20日线约'+M.maBias.toFixed(0)+'%，短期或回拉');
  if(M.volRegime==='high') risks.push('波动率偏高（布林宽度约'+(M.bollWidth*100).toFixed(0)+'%），注意控仓');
  if(M.drawdown>0.15 && M.rsi6<60) risks.push('已从近60日高点回撤约'+(M.drawdown*100).toFixed(0)+'%，留出一定安全空间');
  if(!risks.length) risks.push('当前无明显技术风险信号——但仅为技术面，决策还需结合基本面与消息面');
  return {verdict,vclass,bull,neutral,bear,risks,results,nowP:M.nowP,M,composite,conf,tooShort:false};
}

function analyze(code){
  const s=getSeries(code); if(!s) return null;
  const C=s.closes, H=s.highs, L=s.lows, V=s.vols;
  const N=C.length; if(N<30) return {tooShort:true};
  const nowP = priceOf(code) || C[N-1];
  const ma5=last(sma(C,5)), ma10=last(sma(C,10)), ma20=last(sma(C,20)), ma60=N>=60?last(sma(C,60)):null;
  const m=macd(C), kd=kdj(H,L,C);
  const r6=last(rsi(C,6)), r12=last(rsi(C,12)), r24=last(rsi(C,24));
  const b=boll(C,20,2); const mid=last(b.mid), up=last(b.up), low=last(b.low);
  const win=C.slice(Math.max(0,N-60)); const minP=Math.min.apply(null,win), maxP=Math.max.apply(null,win);
  const pricePos=(nowP-minP)/((maxP-minP)||1);
  const drawdown=(maxP-nowP)/maxP;
  const maBias=(nowP-ma20)/ma20*100;
  const trend=(ma5>ma20&&ma20>ma60)?'bull':(ma5<ma20&&ma20<ma60)?'bear':'mixed';
  const newHigh=nowP>=maxP*0.995; const newLow=nowP<=minP*1.005;
  let volRatio=1; if(V){ const vn=V[N-1], vma=last(sma(V,5)); if(vma) volRatio=vn/vma; }
  const bollWidth=mid?(up-low)/mid:0;
  // —— 环境识别（多指标确认，避免单一信号误判）——
  const upTrend   = ma5>ma20 && ma20>ma60 && nowP>=ma60*0.995;
  const downTrend = ma5<ma20 && ma20<ma60 && nowP<=ma60*1.005;
  const regime = upTrend?'bull':downTrend?'bear':'side';
  const ma20a=sma(C,20); const seg=ma20a.slice(-12); let slope=0;
  if(seg.length>=2) slope=(seg[seg.length-1]-seg[0])/(seg[0]||1);
  const trendStrength=clamp(slope*8,-1,1);
  const rets=[]; const nR=Math.min(N,21); for(let i=N-nR+1;i<N;i++) rets.push((C[i]-C[i-1])/(C[i-1]||1));
  const rmean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const rvar=rets.reduce((a,b)=>a+(b-rmean)*(b-rmean),0)/rets.length;
  const realizedVol=Math.sqrt(rvar);
  const volRegime=(bollWidth<0.08 && realizedVol<0.02)?'calm':(bollWidth>0.2 || realizedVol>0.035)?'high':'normal';
  const accel5=(C[N-1]-C[Math.max(0,N-6)])/C[Math.max(0,N-6)]; // 近5日涨跌幅：区分"健康慢涨"与"急拉透支"
  const momState=(r6>82 && pricePos>0.85 && accel5>0.12)?'overbought':(r6<18 && pricePos<0.15)?'oversold':'neutral';
  const M={ma5,ma10,ma20,ma60,nowP,pricePos,drawdown,maBias,trend,newHigh,newLow,volRatio,bollWidth,
           macd:{dif:last(m.dif),dea:last(m.dea),bar:last(m.bar)},
           rsi6:r6,rsi12:r12,rsi24:r24,
           kdj:{k:last(kd.k),d:last(kd.d),j:last(kd.j)},minP,maxP,
           regime,volRegime,momState,trendStrength,realizedVol};
  return analyzeWith(M, code);
}


function renderAnalysis(){
  if(state.anaMode==='portfolio') return;  // 组合研判模式下，任何意外触发的单只重绘一律跳过，保住组合视图
  const code=state.selected;
  const head=$('anHead'), verdictEl=$('anVerdict'), risksEl=$('anRisks'), mastersEl=$('anMasters'), timeEl=$('anTime');
  if(!code){ head.innerHTML='<span class="meta">还没有选中标的</span>'; verdictEl.innerHTML=''; risksEl.innerHTML=''; mastersEl.innerHTML='<div class="empty">在中间自选点一个，这里会给它做「建仓分析」。</div>'; timeEl.textContent=''; return; }
  const w=state.watch.find(x=>x.code===code);
  head.innerHTML='<span class="big">'+nameOf(code)+'</span><span class="meta">'+code+(w&&w.kind==='fund'?' · 基金':' · 股票/ETF')+'</span><span id="anPrice" style="margin-left:auto;"></span>';
  if(w&&w.kind==='fund' && !state.fundData[code]){ loadFund(code); verdictEl.innerHTML='<div class="empty">基金数据加载中…</div>'; return; }
  if(w&&w.kind!=='fund' && !state.kcache[code+'d']){
    if(!renderAnalysis._pending){ renderAnalysis._pending=true; loadKline(code,'d',(kl)=>{ renderAnalysis._pending=false; if(kl&&kl.length){ const k=kl; k._date=new Date().toISOString().slice(0,10); k._loadedAt=Date.now(); state.kcache[code+'d']=k; } renderAnalysis(); }); }
    verdictEl.innerHTML='<div class="empty">K线加载中…</div>'; return;
  }
  const a=analyze(code);
  if(!a){ verdictEl.innerHTML='<div class="empty">暂无数据</div>'; return; }
  if(a.tooShort){ verdictEl.innerHTML='<div class="empty">K线数据不足（需≥30根），无法分析</div>'; return; }
  let priceTxt='', tTxt='';
  if(w&&w.kind==='fund'){ priceTxt='净值 '+fmt(a.nowP,4); const fd=state.fundData[code]; tTxt= fd&&fd.nav.length? '截至 '+new Date(fd.nav[fd.nav.length-1].t).toLocaleDateString('zh-CN'):''; }
  else { priceTxt='现价 '+fmt(a.nowP); const q=state.quotes[code]; tTxt= q&&q.time? '实时 '+q.time : ''; }
  $('anPrice').innerHTML=priceTxt; timeEl.textContent= tTxt? (' · '+tTxt):'';
  verdictEl.innerHTML='<div class="vbox '+a.vclass+'"><div class="vlabel">综合建仓适宜度</div><div class="vtext">'+a.verdict+'</div><div class="vsub">'+MASTERS.length+'位大师投票结果：看多 '+a.bull+' · 中性 '+a.neutral+' · 看空 '+a.bear+'</div></div>';
  // 关键指标速览总表（让研判有据可依）
  const M=a.M||{}; const mc=(label,val,sub)=>'<div class="istat"><div class="ik">'+label+'</div><div class="iv">'+val+'</div>'+(sub?'<div class="is">'+sub+'</div>':'')+'</div>';
  // 速览卡的 MACD 数值按副图当前参数展示（与副图一致）；大师评级仍用标准 M.macd，互不影响
  let mm=M.macd; try{ const ss=getSeries(code); if(ss&&ss.closes&&ss.closes.length>=30){ mm=macd(ss.closes, state.macdParam); } }catch(_){}
  const trendTxt = M.trend==='bull'?'向上↑':M.trend==='bear'?'向下↓':'横盘→';
  const metricsHtml = '<div class="rtitle">📐 关键指标速览（大师们就是看这些数判断的）</div><div class="imetric-grid">'
    + mc('现价 / 净值', fmt(a.nowP, w&&w.kind==='fund'?4:2), w&&w.kind==='fund'?'基金单位净值':'股票最新价')
    + mc('MA5 / MA20', fmt(M.ma5,2)+' / '+fmt(M.ma20,2), '5日 / 20日均线（平均价线）')
    + mc('MA60', M.ma60!=null?fmt(M.ma60,2):'--', '60日均线（中期趋势线）')
    + mc('MACD', (mm?fmt(mm.dif,2)+' / '+fmt(mm.dea,2):'--'), 'DIF / DEA（参数 '+state.macdParam.fast+'/'+state.macdParam.slow+'/'+state.macdParam.signal+'·红柱=动能向上）')
    + mc('MACD柱', mm?fmt(mm.bar,3):'--', mm&&mm.bar>0?'红柱·上涨动能':'绿柱·下跌动能')
    + mc('RSI6', M.rsi6!=null?M.rsi6.toFixed(0):'--', '>80过热·<20超卖')
    + mc('RSI12 / 24', (M.rsi12!=null?M.rsi12.toFixed(0):'--')+' / '+(M.rsi24!=null?M.rsi24.toFixed(0):'--'), '中期强弱')
    + mc('布林带宽度', (M.bollWidth*100).toFixed(1)+'%', '越大=波动越剧烈')
    + mc('价格分位', (M.pricePos*100).toFixed(0)+'%', '在近60天高低之间的位置')
    + mc('近高回撤', (M.drawdown*100).toFixed(0)+'%', '比近60天最高点跌了多少')
    + mc('量比', M.volRatio!=null?M.volRatio.toFixed(2):'--', '>1放量·<1缩量')
    + mc('整体趋势', trendTxt, '均线排列方向')
    + '</div>';
  $('anMetrics').innerHTML = metricsHtml;
  risksEl.innerHTML='<div class="rtitle">📌 关键提示</div><ul class="rlist">'+a.risks.map(r=>'<li>'+r+'</li>').join('')+'</ul>';
  mastersEl.innerHTML=a.results.map(r=>{
    const sc = r.signal==='看多'?'m-up':r.signal==='看空'?'m-down':'m-flat';
    return '<div class="mcard"><div class="mhead"><span class="mname">'+r.name+'</span><span class="mtag">'+r.tag+'</span><span class="mbadge '+sc+'">'+r.signal+'</span></div>'
      +'<div class="mthesis">'+r.thesis+'</div>'
      +'<div class="mreason">'+r.reason+'</div></div>';
  }).join('');
}
function refreshAnalysisIfActive(){ if(state.view==='analysis') renderAnalysis(); }


/* ============ 建仓分析：按当前持仓汇总研判 ============ */
function ensureDataReady(code, kind){
  return new Promise(resolve=>{
    if(kind==='fund'){
      const fd=state.fundData[code];
      if(fd && fd.cum && fd.cum.length>=10) return resolve(true);
      loadFund(code);
      let n=0; const t=setInterval(()=>{ n++; const f=state.fundData[code]; if(f&&f.cum&&f.cum.length>=10){ clearInterval(t); resolve(true); } else if(n>40){ clearInterval(t); resolve(false); } },250);
      return;
    }
    if(state.kcache[code+'d'] && state.kcache[code+'d'].length>=30) return resolve(true);
    loadKline(code,'d',(kl)=>{ if(kl&&kl.length) state.kcache[code+'d']=kl; resolve(true); });
    setTimeout(()=>resolve(!!(state.kcache[code+'d']&&state.kcache[code+'d'].length>=30)), 9000);
  });
}

async function renderPortfolioAnalysis(){
  state.anaMode='portfolio';  // 进入组合研判模式：此后所有 renderAnalysis 调用被闸门拦下，直到用户切回单只（selectCode/showView 会重置）
  const head=$('anHead'), verdictEl=$('anVerdict'), risksEl=$('anRisks'), mastersEl=$('anMasters'), metricsEl=$('anMetrics'), timeEl=$('anTime');
  if(!state.hold.length){
    head.innerHTML='<span class="big">📊 持仓组合研判</span>';
    verdictEl.innerHTML='<div class="empty">你还没有持仓。先去「💼 持仓管理」加一笔，再回来点这个按钮，就能一键给整个组合做大师研判。</div>';
    risksEl.innerHTML=''; mastersEl.innerHTML=''; metricsEl.innerHTML=''; timeEl.textContent='';
    return;
  }
  // 兜底：保证每只持仓都在自选里，analyze→getSeries 才能正确识别股票/基金
  state.hold.forEach(h=>{ if(!state.watch.some(w=>w.code===h.code)) state.watch.push({code:h.code, kind:h.kind}); });
  head.innerHTML='<span class="big">📊 持仓组合研判</span><span class="meta">'+state.hold.length+' 只标的</span><span id="anPrice" style="margin-left:auto;"></span>';
  verdictEl.innerHTML='<div class="empty">正在为每只持仓拉取行情数据…（首次可能需几秒）</div>';
  risksEl.innerHTML=''; mastersEl.innerHTML=''; metricsEl.innerHTML=''; timeEl.textContent='';
  await Promise.all(state.hold.map(h=>ensureDataReady(h.code, h.kind)));
  const items = state.hold.map(h=>{ const a=analyze(h.code); return {h, a}; });
  const valid = items.filter(x=>x.a && !x.a.tooShort);
  const bad = items.filter(x=>!(x.a && !x.a.tooShort));
  let bull=0, neutral=0, bear=0, scoreSum=0;
  valid.forEach(x=>{ if(x.a.bull>x.a.bear && x.a.bull>x.a.neutral) bull++; else if(x.a.bear>x.a.bull && x.a.bear>x.a.neutral) bear++; else neutral++; scoreSum+=x.a.composite; });
  const avg = valid.length? Math.round(scoreSum/valid.length):0;
  let mv=0, cost=0; state.hold.forEach(h=>{ const p=priceOf(h.code)||0; mv+=p*h.shares; cost+=h.cost*h.shares; });
  let pVerdict, pClass;
  if(!valid.length){ pVerdict='⚠️ 持仓里没有可分析的标的（可能行情/净值还没拉到，稍后重试）'; pClass='v-flat'; }
  else if(bull>=bear && bull>=neutral && bull>0){ pVerdict='🟢 组合整体偏积极：多数持仓处于可建仓/加仓区，可分批布局、注意控制节奏'; pClass='v-good'; }
  else if(bear>=bull && bear>=neutral && bear>0){ pVerdict='🔴 组合整体偏弱：多数持仓被大师判为暂缓/回避，建议控仓观望、不急于加仓'; pClass='v-bad'; }
  else { pVerdict='⚪ 组合信号分化：多空互现，建议按个股信号分别操作，整体保持中性仓位'; pClass='v-mid'; }
  verdictEl.innerHTML='<div class="vbox '+pClass+'"><div class="vlabel">持仓组合整体建仓适宜度</div><div class="vtext">'+pVerdict+'</div><div class="vsub">'+valid.length+' 只有效标的 · 平均综合评分 '+(avg>=0?'+':'')+avg+' · 看多 '+bull+' · 中性 '+neutral+' · 看空 '+bear+'</div></div>';
  const mc=(label,val,sub)=>'<div class="istat"><div class="ik">'+label+'</div><div class="iv">'+val+'</div>'+(sub?'<div class="is">'+sub+'</div>':'')+'</div>';
  metricsEl.innerHTML='<div class="rtitle">📐 组合概览</div><div class="imetric-grid">'
    + mc('持仓标的数', state.hold.length, '本次纳入分析')
    + mc('有效分析', valid.length, bad.length?('另有 '+bad.length+' 只数据不足'):'全部就绪')
    + mc('平均综合评分', (avg>=0?'+':'')+avg, '13位大师加权')
    + mc('看多 / 中性 / 看空', bull+' / '+neutral+' / '+bear, '标的分布')
    + mc('持仓市值', fmt(mv), '现价×数量')
    + mc('持仓成本', fmt(cost), '成本价×数量')
    + mc('组合总浮盈亏', fmt(mv-cost), pct(cost? (mv-cost)/cost*100 : 0))
    + '</div>';
  const tally={}; valid.forEach(x=>x.a.risks.forEach(r=>{ tally[r]=(tally[r]||0)+1; }));
  const topRisks=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]).slice(0,5);
  const bearList=valid.filter(x=>x.a.bear>x.a.bull && x.a.bear>x.a.neutral).map(x=>nameOf(x.h.code)+'('+x.h.code+')');
  let riskHtml='<div class="rtitle">📌 组合关键提示</div><ul class="rlist">';
  if(bearList.length) riskHtml+='<li>🔻 被大师判为「看空/暂缓」的标的：'+bearList.join('、')+' —— 这些建议优先观望或减仓</li>';
  if(topRisks.length) topRisks.forEach(r=>{ const c=tally[r]; riskHtml+='<li>'+r+(c>1?('（'+c+' 只标的共同出现）'):'')+'</li>'; });
  if(!bearList.length && !topRisks.length) riskHtml+='<li>当前组合无明显技术风险信号</li>';
  riskHtml+='</ul>';
  risksEl.innerHTML=riskHtml;
  mastersEl.innerHTML = valid.concat(bad).map(x=>{
    if(!x.a || x.a.tooShort){ return '<div class="mcard"><div class="mhead"><span class="mname">'+nameOf(x.h.code)+'</span><span class="mtag">'+x.h.code+'</span><span class="mbadge m-flat">数据不足</span></div><div class="mthesis">K线/净值不足，无法分析</div></div>'; }
    const a=x.a; const sc=a.bull>a.bear&&a.bull>a.neutral?'m-up':a.bear>a.bull&&a.bear>a.neutral?'m-down':'m-flat';
    const sig=a.bull>a.bear&&a.bull>a.neutral?'看多':a.bear>a.bull&&a.bear>a.neutral?'看空':'中性';
    // 三色信号灯：红=减仓警示/技术走弱，绿=可持有偏强，黄=谨慎观望（与红涨绿跌徽章区分）
    const comp=a.composite;
    let light, lightTxt;
    if(sig==='看空' || comp<=-10){ light='red'; lightTxt='🔴 减仓警示 · 技术走弱'; }
    else if(sig==='看多' && comp>=10){ light='green'; lightTxt='🟢 可持有 · 偏强'; }
    else { light='yellow'; lightTxt='🟡 谨慎观望 · 方向不明'; }
    // 当前盈亏（成本 vs 现价）：你这笔是亏着还是赚着，大师建议要结合这个给
    const p=priceOf(x.h.code), co=x.h.cost||0, pnl=Math.round((p-co)*x.h.shares*100)/100, pctv=co?pnl/(co*x.h.shares)*100:0;
    const pnlCls=cls(pnl), pnlTxt='当前'+(pnl>0?'浮盈':'浮亏')+' '+fmt(Math.abs(pnl))+'（'+pct(pctv)+'）';
    let pnlExtra='';
    if(pnl<0 && co>0 && p>0){ pnlExtra=' · 回本需涨 +'+(((co-p)/p)*100).toFixed(2)+'%（还差 '+fmt(Math.abs((co-p)*x.h.shares))+' 回本）'; }
    const hasTA=(x.h.target>0)||(x.h.stop>0);
    let taTxt='';
    if(hasTA){
      const tg=x.h.target>0?('止盈 '+fmt(x.h.target)):''; const sp=x.h.stop>0?('止损 '+fmt(x.h.stop)):'';
      let hit=''; if(x.h.target>0 && p>=x.h.target) hit=' · 已触及止盈✔'; else if(x.h.stop>0 && p<=x.h.stop) hit=' · 已触及止损⚠';
      taTxt='<div class="madvice" style="margin-top:6px;">⚙️ 预警线：'+(tg+(tg&&sp?' / ':'')+sp)+hit+'</div>';
    }
    let advice;
    if(pnl<0){ if(a.bear>a.bull&&a.bear>a.neutral) advice='⚠️ 已浮亏且技术面走弱：大师偏看空，建议严格控仓/设止损，避免越套越深；仓位重可先减一部分。';
      else if(a.bull>a.bear&&a.bull>a.neutral) advice='🟢 虽浮亏但技术面转强：可继续持有，资金宽裕可分批小补摊薄成本（忌一次性重仓摊平）。';
      else advice='⚪ 已浮亏、技术面中性：建议持有观察，不急于补仓也不急着割，等方向明确。'; }
    else { if(a.bull>a.bear&&a.bull>a.neutral) advice='🟢 已浮盈且技术面偏强：可继续持有、让利润奔跑，注意设移动止盈。';
      else if(a.bear>a.bull&&a.bear>a.neutral) advice='🔴 已浮盈但技术面走弱：建议逢高部分落袋、锁定利润，防利润回吐。';
      else advice='⚪ 已浮盈、技术面中性：可持有，关注是否转弱。'; }
    let html='<div class="mcard mhold"><div class="mhead"><span class="traffic traffic-'+light+'"></span><span class="mname">'+nameOf(x.h.code)+'</span><span class="mtag">'+x.h.code+(x.h.kind==='fund'?' · 基金':' · 股票')+'</span><span class="mbadge '+sc+'">'+sig+'</span></div>'
      +'<div class="ltxt ltxt-'+light+'">'+lightTxt+'</div>'
      +'<div class="mthesis">综合评分 '+(a.composite>=0?'+':'')+a.composite+' · 看多'+a.bull+'/中性'+a.neutral+'/看空'+a.bear+'</div>'
      +'<div class="mpnl '+pnlCls+'">'+pnlTxt+(pnlExtra?'<span class="pnl-extra">'+pnlExtra+'</span>':'')+'</div>'
      +'<div class="madvice">'+advice+'</div>'
      + taTxt;
    // 13 位大师逐位给出分析（每位大师的看法 + 理由）
    html += a.results.map(r=>{ const rsc=r.signal==='看多'?'m-up':r.signal==='看空'?'m-down':'m-flat';
      return '<div class="mcard msub"><div class="mhead"><span class="mname">'+r.name+'</span><span class="mtag">'+r.tag+'</span><span class="mbadge '+rsc+'">'+r.signal+'</span></div>'
        +'<div class="mthesis">'+r.thesis+'</div>'+'<div class="mreason">'+r.reason+'</div></div>'; }).join('');
    return html;
  }).join('');
}

