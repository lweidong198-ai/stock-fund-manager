/* =========================================================================
 * quotes.js
 * 模块来源小节：实时行情：腾讯 qt.gtimg.cn / 大盘指数条 / 五档盘口 + 基本资料 / 工作台首页
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 实时行情：腾讯 qt.gtimg.cn ============ */
function parseTencent(text){
  const out={};
  const re=/v_(\w+)="([^"]*)"/g; let m;
  while((m=re.exec(text))){
    const code=m[1]; const f=m[2].split('~');
    if(f.length<35){
      // 美股/海外指数简化格式: f[3]=现价 f[4]=涨跌额(点) f[5]=涨跌幅%
      if(f.length>=6){
        out[code]={code,name:f[1]||code,price:parseFloat(f[3])||0,prevClose:0,open:0,time:'',change:parseFloat(f[4])||0,changePct:parseFloat(f[5])||0,high:0,low:0,volume:0,amount:0,turnover:0,pe:0,amplitude:0,mktCap:0,pb:0,limitUp:0,limitDown:0,ask:[],bid:[],outer:0,inner:0,limited:true};
      }
      continue;
    }
    out[code]={
      code, name:f[1]||code, price:parseFloat(f[3]), prevClose:parseFloat(f[4]),
      open:parseFloat(f[5]), time:f[30]||'', change:parseFloat(f[31]), changePct:parseFloat(f[32]),
      high:parseFloat(f[33]), low:parseFloat(f[34]), volume:parseFloat(f[36]), amount:parseFloat(f[37]),
      turnover:parseFloat(f[38]), pe:parseFloat(f[39]), amplitude:parseFloat(f[43]),
      mktCap:parseFloat(f[45]), pb:parseFloat(f[46]), limitUp:parseFloat(f[47]), limitDown:parseFloat(f[48]),
      outer:parseFloat(f[7])||0, inner:parseFloat(f[8])||0,
      ask:[[f[19],f[20]],[f[21],f[22]],[f[23],f[24]],[f[25],f[26]],[f[27],f[28]]].map(x=>[parseFloat(x[0]),parseFloat(x[1])]),
      bid:[[f[9],f[10]],[f[11],f[12]],[f[13],f[14]],[f[15],f[16]],[f[17],f[18]]].map(x=>[parseFloat(x[0]),parseFloat(x[1])])
    };
  }
  return out;
}


/* ============ 大盘指数条 ============ */
/* 代码→中文名映射：离线演示 / 用户手填任意代码时，作为名字兜底。
   联网真实数据时优先用腾讯 f[1] / 东方财富 fS_name，此处仅做兜底，避免只显示裸代码。 */
const CODE_NAMES={
  // 指数
  sh000001:'上证指数', sz399001:'深证成指', sz399006:'创业板指', sh000300:'沪深300', sh000688:'科创50',
  // 示例自选 / 常见股票
  sh600519:'贵州茅台', sz000858:'五粮液', sh601318:'中国平安', sz300750:'宁德时代',
  sh600036:'招商银行', sh601166:'兴业银行', sh600276:'恒瑞医药', sz000651:'格力电器',
  sz000333:'美的集团', sh601012:'隆基绿能', sh600900:'长江电力', sh601899:'紫金矿业',
  // ETF / 指数基金
  sh510300:'沪深300ETF', sh510050:'上证50ETF', sh588000:'科创50ETF', sz159915:'创业板ETF',
  sz159995:'芯片ETF', sh512660:'军工ETF', sh515030:'新能源车ETF', sh512010:'医药ETF',
  // 场外基金（含中证系列）
  '000001':'华夏成长混合', '003304':'前海开源沪港深核心资源混合A', '161725':'招商中证白酒指数', '110011':'易方达中小盘混合',
  '005827':'易方达蓝筹精选混合', '320007':'诺安成长混合', '260108':'景顺长城新兴成长混合', '163406':'兴全合润混合',
  // 港股
  hk00700:'腾讯控股'
};
const INDEXES=[
  {code:'sh000001',name:'上证指数'},{code:'sz399001',name:'深证成指'},{code:'sz399006',name:'创业板指'},{code:'sh000300',name:'沪深300指数'},{code:'sh000688',name:'科创50'},
  {sep:true},
  {code:'s_usDJI',name:'道琼斯',grp:'us'},{code:'s_usIXIC',name:'纳斯达克',grp:'us'},{code:'s_usINX',name:'标普500',grp:'us'}
];
let indexQuotes={};
function refreshIndices(){
  setDataStatus('load','加载中…');
  renderIndexBar(); // 先显示"加载中"
  const url='https://qt.gtimg.cn/q='+INDEXES.filter(x=>x.code).map(x=>x.code).join(',')+'&_='+Date.now();
  const t=setTimeout(()=>{ useDemoIndices(); }, 8000);
  fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); }).then(buf=>{
    clearTimeout(t);
    const text=new TextDecoder('gb18030').decode(buf); const d=parseTencent(text);
    let got=0; INDEXES.forEach(x=>{ if(d[x.code]){ indexQuotes[x.code]=d[x.code]; got++; } });
    if(got===0){ useDemoIndices(); return; }
    setDemo(false); setDataStatus('ok');
    renderIndexBar(); if(state.view==='home') renderHome();
  }).catch(e=>{ clearTimeout(t); useDemoIndices(); });
}
function useDemoIndices(){
  INDEXES.forEach(x=>{ indexQuotes[x.code]=demoIndex(x.code); });
  setDemo(true); setDataStatus('demo'); renderIndexBar(); if(state.view==='home') renderHome();
}
function renderIndexBar(mode){
  const el=$('idxBar'); if(!el) return;
  if(mode==='err'){ el.innerHTML='<div class="idxchip" style="min-width:auto;cursor:pointer;color:#d22;" onclick="refreshIndices()">⚠ 指数获取失败（点此重试 / 检查网络）</div>'; return; }
  const has=INDEXES.some(x=>x.code && indexQuotes[x.code]);
  if(!has){ el.innerHTML='<div class="idxchip" style="min-width:auto;color:#2563eb;">指数加载中…</div>'; return; }
  el.innerHTML = INDEXES.map(x=>{
    if(x.sep) return '<div class="idx-sep"><span>美股</span></div>';
    const q=indexQuotes[x.code]; const cp=q?q.changePct:0; const c=cls(cp); const arrow=cp>0?'▲':(cp<0?'▼':'—');
    return '<div class="idxchip'+(x.grp==='us'?' idx-us':'')+'"><span class="iname">'+x.name+'</span><span class="ival '+c+'">'+(q?fmt(q.price):'--')+'</span><span class="ipct '+c+'">'+arrow+' '+pct(cp)+'</span></div>';
  }).join('');
}


/* ============ 五档盘口 + 基本资料 ============ */
function renderQuoteBoard(){
  const code=state.selected; const w=state.watch.find(x=>x.code===code);
  const board=$('quoteBoard'); if(!w||w.kind==='fund'){ if(board) board.style.display='none'; return; }
  const q=state.quotes[code];
  if(!q){
    if(board){ board.style.display='grid'; }
    const lt=$('depthTable'); if(lt) lt.innerHTML='<tr><td colspan="3" class="qloading">实时行情加载中…（若长时间不出现，说明网络取不到该股票实时数据，已临时用演示数据）</td></tr>';
    const fi=$('fundInfo'); if(fi) fi.innerHTML='<div class="kv"><span class="k">状态</span><span class="v">等待行情…</span></div>';
    return;
  }
  if(q.limited){   // 美股/海外指数：腾讯仅返回简化格式(现价+涨跌%)，无五档/开收高低 → 如实提示，不显示全0
    board.style.display='block';
    const lt=$('depthTable'); if(lt) lt.innerHTML='<tr><td colspan="3" class="qloading">美股实时行情有限：腾讯接口仅提供<b>现价</b>与<b>涨跌%</b>，无五档盘口 / 今开昨收最高最低。已如实显示，不编造数据。</td></tr>';
    const fi2=$('fundInfo'); if(fi2) fi2.innerHTML='<div class="kv"><span class="k">说明</span><span class="v">美股行情仅现价 + 涨跌%</span></div>';
    return;
  }
  board.style.display='grid';
  const a=q.ask||[], b=q.bid||[];
  let h='';
  for(let i=4;i>=0;i--){ const p=a[i]?a[i][0]:0, v=a[i]?a[i][1]:0; h+='<tr class="ask"><td class="lv">卖'+(i+1)+'</td><td class="pr">'+fmt(p)+'</td><td class="vol">'+fmt(v)+'</td></tr>'; }
  h+='<tr class="midrow"><td class="lv">现价</td><td class="pr '+(cls(q.change))+'">'+fmt(q.price)+'</td><td class="vol '+(cls(q.change))+'">'+pct(q.changePct)+'</td></tr>';
  for(let i=0;i<5;i++){ const p=b[i]?b[i][0]:0, v=b[i]?b[i][1]:0; h+='<tr class="bid"><td class="lv">买'+(i+1)+'</td><td class="pr">'+fmt(p)+'</td><td class="vol">'+fmt(v)+'</td></tr>'; }
  $('depthTable').innerHTML=h;
  const rows=[['今开',q.open],['昨收',q.prevClose],['最高',q.high],['最低',q.low],['振幅%',q.amplitude],['换手%',q.turnover],['市盈率',q.pe],['市净率',q.pb],['总市值(亿)',q.mktCap],['涨停',q.limitUp],['跌停',q.limitDown]];
  $('fundInfo').innerHTML = rows.map(r=>'<div class="kv"><span class="k">'+r[0]+'</span><span class="v">'+fmt(r[1])+'</span></div>').join('');
}


/* ============ 工作台首页 ============ */
/* 顶部常驻市况战略透镜（全站可见） */
async function renderGlobalRegime(){
  const el=$('globalRegime'); if(!el) return;
  try{
    const bk=await loadKlineP('sh000300','d');
    const b60=klinePct(bk,60);
    state.bench60=b60;
    if(b60==null){ el.className='global-regime unknown'; el.querySelector('.rg-label').textContent='市况数据不足'; $('globalRegimeRule').textContent=''; if(state.view==='home') renderHome(); return; }
    const regime=b60>5?'bull':(b60<-5?'bear':'flat');
    el.className='global-regime '+regime;
    const lbl=regime==='bull'?'牛市':(regime==='bear'?'熊市':'震荡');
    const rule=regime==='bull'?('沪深300近60日 +'+b60.toFixed(1)+'% → 低波动行业占优，别瞎折腾')
      :regime==='bear'?('沪深300近60日 '+b60.toFixed(1)+'% → 动量反转，超跌反弹候选')
      :('沪深300近60日 '+b60.toFixed(1)+'% → 无可靠规律，建议观望');
    el.querySelector('.rg-label').textContent=lbl;
    $('globalRegimeRule').textContent=rule;
    if(state.view==='home') renderHome();
  }catch(e){
    el.className='global-regime unknown';
    el.querySelector('.rg-label').textContent='市况获取失败';
    $('globalRegimeRule').textContent='';
    console.warn('regime failed',e);
  }
}

function renderHome(){
  // 1) 我的资产速览
  let mv=0, pl=0, day=0;
  state.hold.forEach(h=>{ const q=state.quotes[h.code]; const fd=state.fundData[h.code]; const cur=q?q.price:(fd?fd.latest:0); if(cur){ mv+=cur*h.shares; pl+=(cur-h.cost)*h.shares; if(h.kind==='fund'){ if(fd&&fd.prev) day+=h.shares*(fd.latest-fd.prev); } else { if(q&&q.changePct!=null) day+=cur*h.shares*q.changePct/(100+q.changePct); } } });
  const cost=mv-pl;
  const assetEl=$('homeAsset');
  if(assetEl){
    assetEl.innerHTML='<div class="ov-card"><span class="ov-icon">💰</span><div class="ov-info"><span class="ov-v">'+fmt(mv)+'</span><span class="ov-k">持仓总市值</span></div></div>'
      +'<div class="ov-card"><span class="ov-icon">📈</span><div class="ov-info"><span class="ov-v '+(cls(pl))+'">'+fmt(pl)+'</span><span class="ov-k">总浮动盈亏 ('+pct(cost?pl/cost*100:0)+')</span></div></div>'
      +'<div class="ov-card"><span class="ov-icon">🔄</span><div class="ov-info"><span class="ov-v '+(cls(day))+'">'+fmt(day)+'</span><span class="ov-k">今日盈亏</span></div></div>'
      +'<div class="ov-card"><span class="ov-icon">📊</span><div class="ov-info"><span class="ov-v">'+state.hold.length+' / '+state.watch.length+'</span><span class="ov-k">持仓 / 自选</span></div></div>';
  }
  // 2) 市况与策略结论
  const rg=$('homeRegime');
  if(rg){
    const b=state.bench60;
    const regime=(b==null)?'unknown':(b>5?'bull':(b<-5?'bear':'flat'));
    const pctTxt=(b==null)?'—':((b>=0?'+':'')+b.toFixed(1)+'%');
    // 纯描述：只说大盘现在偏强/偏弱，不给"该持什么"的方向（原「牛→低波 / 熊→反转」规律
    // 2026-08-11 真实复测 t=0.43/0.17 均不显著，6个月口径熊市腿甚至 t=-2.13 显著为负，已撤下）
    let ruleLine, conclLine;
    if(regime==='bull'){ ruleLine='最近两三个月大盘整体在涨'; conclLine='仅为状态描述，不代表接下来还会涨'; }
    else if(regime==='bear'){ ruleLine='最近两三个月大盘整体在跌'; conclLine='仅为状态描述，不代表接下来还会跌'; }
    else if(regime==='flat'){ ruleLine='最近两三个月大盘横着走，方向不明'; conclLine='仅为状态描述，本工具不猜方向'; }
    else { ruleLine='大盘数据未加载'; conclLine='稍后重试'; }
    const rc1='<div class="rc-card '+(regime==='unknown'?'flat':regime)+'"><h3>大盘温度（纯描述）</h3><div class="rc-line">沪深300近60日 <b>'+pctTxt+'</b><br>'+ruleLine+'</div><div class="rc-sub">'+conclLine+'</div></div>';
    const rc2='<div class="rc-card verified"><h3>经真实验证的策略</h3><div class="rc-line">机会精选·基金版<br>半年维度 IC <b>+0.099</b>（t=4.34）</div><div class="rc-sub">1958只基金·155个时点样本外；行业ETF旧模型已因反向下线</div></div>';
    rg.innerHTML=rc1+rc2;
  }
  // 3) 快捷入口
  const mods=[{v:'market',i:'📊',t:'行情看板',d:'K线+五档盘口+各类指标'},{v:'hold',i:'💼',t:'持仓管理',d:'成本录入·盈亏自动算'},{v:'fund',i:'🔍',t:'机会精选',d:'主动基金·半年维度筛选'},{v:'analysis',i:'🧠',t:'建仓分析',d:'集合大师思维框架研判'},{v:'sectors',i:'🌐',t:'行业趋势扫描',d:'哪个行业在向上'},{v:'fundAnalysis',i:'📈',t:'基金深度分析',d:'净值诊断·风险体检'},{v:'rotation',i:'🌡️',t:'行业温度计',d:'只看冷热·不构成推荐'},{v:'datacenter',i:'🧮',t:'可靠数据中心',d:'质量/估值/分散/定投'}];
  const mg=$('homeMods');
  if(mg){ mg.innerHTML=mods.map(m=>'<div class="modcard" data-go="'+m.v+'"><div class="mi">'+m.i+'</div><div class="mt">'+m.t+'</div><div class="md">'+m.d+'</div></div>').join(''); mg.querySelectorAll('.modcard').forEach(c=>c.onclick=()=>goView(c.dataset.go)); }
}

function refreshQuotes(cb){
  const stockCodes = [...new Set([...state.watch.filter(w=>w.kind==='stock'), ...state.hold.filter(h=>h.kind==='stock')].map(x=>x.code))];
  let fired=false; const done=()=>{ if(fired)return; fired=true; if(typeof cb==='function') cb(); };
  if(stockCodes.length){
    const url='https://qt.gtimg.cn/q='+stockCodes.join(',')+'&_='+Date.now();
    const t=setTimeout(()=>{ useDemoQuotes(stockCodes); done(); }, 8000);
    fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); }).then(buf=>{
      clearTimeout(t);
      const text = new TextDecoder('gb18030').decode(buf);
      const d=parseTencent(text);
      if(Object.keys(d).length===0){ useDemoQuotes(stockCodes); done(); return; }
      Object.assign(state.quotes, d);
      setDemo(false); setDataStatus('ok');
      onQuotesUpdated();
      done();
    }).catch(err=>{ clearTimeout(t); useDemoQuotes(stockCodes); done(); });
  }
  fundCodesToLoad().forEach(c=>{ if(needsFund(c)) loadFund(c); });
  refreshIndices();
  $('updTime').textContent = '更新 '+ts();
  if(!stockCodes.length) done();
}
function ensureStockQuote(code){
  return new Promise(res=>{
    if(state.quotes[code] && state.quotes[code].price) return res(true);
    const url='https://qt.gtimg.cn/q='+code+'&_='+Date.now();
    fetch(url).then(r=>r.arrayBuffer()).then(buf=>{
      const text=new TextDecoder('gb18030').decode(buf);
      const d=parseTencent(text);
      if(d[code]){ state.quotes[code]=d[code]; onQuotesUpdated(); }
      res(true);
    }).catch(()=>res(false));
  });
}
function useDemoQuotes(codes){
  codes.forEach(c=>{ state.quotes[c]=demoQuote(c); });
  setDemo(true); setDataStatus('demo'); onQuotesUpdated();
}
function onQuotesUpdated(){ renderWatch();
  // 正在填「止盈/止损价」输入框时，跳过持仓表重渲染，避免清空用户正在输入的内容
  if(document.activeElement && document.activeElement.matches && document.activeElement.matches('input[data-ai]')){}
  else renderHold();
  if(state.selected && (state.watch.find(x=>x.code===state.selected)||{}).kind!=='fund') renderDetailHead(); if(state.view==='analysis') renderAnalysis(); if(state.view==='home') renderHome(); refreshKlinesToToday();
  if(window.DataCalibrator){ DataCalibrator.reportQuotes(DataCalibrator.checkQuotes(state.quotes)); if(!state.demo) DataCalibrator.clearFetch(); }
}

// 交易时段判断（A股）：周一~周五 9:15-11:30 / 13:00-15:00
function isTradingNow(){
  const d=new Date(), day=d.getDay();
  if(day===0||day===6) return false;
  const hm=d.getHours()*60+d.getMinutes();
  return (hm>=555 && hm<=690) || (hm>=780 && hm<=900);
}
// 跨日/盘中：把「所有已缓存、但停在旧日」的K线补刷到今天（修复“除选中股外其余K线停在上一交易日”）
// 旧版仅刷选中股，导致自选/机会列表的K线永远停在批量拉取那一刻；现改为按缓存里每一只标的逐个补刷。
// 分批限流(每批4只、间隔120ms)避免触发腾讯同IP限流；命中限流返回演示数据则不动缓存，下一轮自动重试自愈。
function refreshKlinesToToday(){
  if(refreshKlinesToToday._busy) return;
  const now=Date.now(); const _d=new Date(); const today=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
  const trading=isTradingNow(), sel=state.selected;
  const tasks=[];
  for(const key in state.kcache){
    if(!/[dw]$/.test(key)) continue;                 // 仅处理日/周K
    const cached=state.kcache[key];
    if(!cached||!cached.length||cached._demo) continue;
    const code=key.slice(0,-1), period=key.slice(-1);
    const w=(state.watch.find(x=>x.code===code)||state.hold.find(x=>x.code===code));
    if(w&&w.kind==='fund') continue;                 // 基金无K线
    const needDay = cached._date!==today;
    const needIntra = code===sel && trading && (!cached._loadedAt || now-cached._loadedAt>120000);
    if(needDay||needIntra) tasks.push({code,period,cached});
  }
  if(!tasks.length) return;
  refreshKlinesToToday._busy=true;
  let i=0; const BATCH=4, GAP=120;
  const step=()=>{
    const slice=tasks.slice(i,i+BATCH); i+=BATCH;
    slice.forEach(({code,period,cached})=> refreshOneKline(code,period,cached));
    if(i<tasks.length) setTimeout(step, GAP); else refreshKlinesToToday._busy=false;
  };
  step();
}
// 单只K线补刷：tailOnly 只拉当日根，合并进缓存并视情况重绘（详情/分析视图）
function refreshOneKline(code, period, cached){
  if(!cached) cached=state.kcache[code+period];
  if(!cached||!cached.length||cached._demo) return;
  const _d=new Date(); const today=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
  loadKline(code, period, (tail, isDemo)=>{
    if(isDemo||!tail||!tail.length) return;          // 限流/无数据→不动缓存，下一轮重试自愈
    let updated=false;
    tail.forEach(b=>{
      const idx=cached.findIndex(x=>x.date===b.date);
      if(idx>=0){ cached[idx]=b; updated=true; }
      else if(b.date>cached[cached.length-1].date){ cached.push(b); updated=true; }
    });
    if(updated) cached.sort((a,b)=>a.date<b.date?-1:1);
    cached._date=today; cached._loadedAt=Date.now();  // 标记今日已核对（无论是否出新bar，避免周线/盘前无限重试）
    if(code===state.selected){ if(state.view==='analysis') renderAnalysis(); else if(state.view==='market'||state.view==='detail') renderDetail(); }
    if(window.DataCalibrator) DataCalibrator.reportKline(code, DataCalibrator.checkKline(code, cached));
  }, {tailOnly:true, ignoreReqKey:true});
}

