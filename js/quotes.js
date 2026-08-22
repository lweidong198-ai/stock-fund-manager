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
  let html = INDEXES.map(x=>{
    if(x.sep) return '<div class="idx-sep"><span>美股</span></div>';
    const q=indexQuotes[x.code]; const cp=q?q.changePct:0; const c=cls(cp); const arrow=cp>0?'▲':(cp<0?'▼':'—');
    const dir = cp>0?'idx-up':(cp<0?'idx-down':'idx-flat');
    return '<div class="idxchip'+(x.grp==='us'?' idx-us':'')+' '+dir+'"><span class="iname">'+x.name+'</span><span class="ival '+c+'">'+(q?fmt(q.price):'--')+'</span><span class="ipct '+c+'">'+arrow+' '+pct(cp)+'</span></div>';
  }).join('');
  html += buildTradeCalendarChip();
  el.innerHTML = html;
}

/* 交易日历嵌入指数条末端的小色块 HTML（靠右、带「日历」标签，与指数卡区分） */
function buildTradeCalendarChip(){
  const now=new Date();
  const today=copyDate(now);
  const trading=isTradingDay(today);
  const tdNum=tradingDayOfMonth(today);
  const tdRem=remainingTradingDays(today);
  const status = trading ? '<span class="tc-status trade">交易中</span>' : '<span class="tc-status rest">'+(today.getDay()===0||today.getDay()===6?'周末休市':'休市')+'</span>';
  const dt = fmtMD(today)+' '+weekdayName(today);
  const sub = '本月第<span class="tc-hl">'+tdNum+'</span>个交易日 · 还剩<span class="tc-hl">'+tdRem+'</span>天';
  return '<span class="tc-pill"><span class="tc-tag">日历</span><span class="tc-date">'+dt+'</span>'+status+'<span class="tc-sub">'+sub+'</span></span>';
}


/* ============ 顶部环球·商品 自动滚动信息条 ============ */
/* 标的：腾讯免费源能真实返回、已验证的「环球+商品」代理——
   港股(恒生指数) / 日经·德·法·美 QDII-ETF / 黄金·原油·有色·国债 ETF。
   日经/DAX/FTSE 等原生指数腾讯免费源不返回，故用跟踪它们的 A 股 QDII-ETF 代理（同涨同跌、零Key）。 */
const TICKER=[
  {code:'r_hkHSI',  name:'恒生指数'},
  {code:'sh513520', name:'日经225ETF'},
  {code:'sh513030', name:'德国ETF'},
  {code:'sh513080', name:'法国ETF'},
  {code:'sh513500', name:'标普500ETF'},
  {code:'sh513100', name:'纳指ETF'},
  {code:'sh518880', name:'黄金ETF'},
  {code:'sh501018', name:'原油LOF'},
  {code:'sh512400', name:'有色ETF'},
  {code:'sh511260', name:'十年国债ETF'}
];
let tickerQuotes={};
function refreshTicker(){
  const url='https://qt.gtimg.cn/q='+TICKER.map(x=>x.code).join(',')+'&_='+Date.now();
  fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); }).then(buf=>{
    const d=parseTencent(new TextDecoder('gb18030').decode(buf));
    let got=0; TICKER.forEach(x=>{ if(d[x.code]){ tickerQuotes[x.code]=d[x.code]; got++; } });
    if(got>0) renderTicker();
  }).catch(()=>{ /* 失败保留上次内容，不闪烁 */ });
}
function renderTicker(){
  const el=$('tkTrack'); if(!el) return;
  const items=TICKER.map(x=>{
    const q=tickerQuotes[x.code]; if(!q) return '';
    const cp=(q.changePct!=null)?q.changePct:0;
    const cls=cp>0?'tk-up':(cp<0?'tk-down':'tk-flat');
    const arrow=cp>0?'▲':(cp<0?'▼':'—');
    return '<span class="tk-item"><span class="tk-name">'+escapeHtml(x.name)+'</span>'
      +'<span class="tk-val '+cls+'">'+fmt(q.price)+'</span>'
      +'<span class="'+cls+'">'+arrow+' '+pct(cp)+'</span></span>';
  }).join('');
  if(!items){ el.innerHTML='<span class="tk-loading">环球 / 商品行情暂未取到（点「手动刷新」重试）</span>'; return; }
  el.innerHTML=items+items; // 复制一份实现无缝循环滚动
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

/* —— 首页几何标记（全部 CSS/SVG 自绘，不贴任何图标字体） —— */
function svgMark(name){
  // 统一 24x24 视图，stroke 用当前色（由父级 .ov-mark / .mi 控制）
  const S='stroke="#2f6fed"'; // 默认蓝，具体由调用方包裹色控制
  const M={
    // 资产速览
    cash:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="#2f6fed" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="#2f6fed"/><path d="M6.5 12h2M15.5 12h2" stroke="#2f6fed" stroke-width="1.8" stroke-linecap="round"/></svg>',
    profit:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 16l5-5 4 3 7-7" stroke="#2f6fed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h4v4" stroke="#2f6fed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    day:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="#2f6fed" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="#2f6fed"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3" stroke="#2f6fed" stroke-width="1.6" stroke-linecap="round"/></svg>',
    count:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="#2f6fed" stroke-width="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="#2f6fed" stroke-width="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="#2f6fed" stroke-width="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="#2f6fed" stroke-width="1.8"/></svg>',
    // 快捷入口
    market:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 17l4-5 3 2 5-7 4 5" stroke="#2f6fed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hold:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="8" width="18" height="12" rx="2" stroke="#1f9d55" stroke-width="1.8"/><path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="#1f9d55" stroke-width="1.8" stroke-linecap="round"/></svg>',
    fund:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="#7a5cf0" stroke-width="1.8"/><path d="M15.5 15.5L20 20" stroke="#7a5cf0" stroke-width="1.8" stroke-linecap="round"/></svg>',
    analysis:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="7" r="2.2" stroke="#ef8a1e" stroke-width="1.7"/><circle cx="18" cy="7" r="2.2" stroke="#ef8a1e" stroke-width="1.7"/><circle cx="12" cy="17" r="2.2" stroke="#ef8a1e" stroke-width="1.7"/><path d="M7.6 8.6l3 6.4M16.4 8.6l-3 6.4M8 7h8" stroke="#ef8a1e" stroke-width="1.5"/></svg>',
    sectors:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#13a3c7" stroke-width="1.6"/><path d="M12 3v18M3 12h18" stroke="#13a3c7" stroke-width="1.4"/><path d="M12 12l7.5-4" stroke="#13a3c7" stroke-width="1.4"/></svg>',
    fundAnalysis:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16" stroke="#e0558f" stroke-width="1.8" stroke-linecap="round"/><path d="M7.5 15l3.5-4 3 2.5L20 7" stroke="#e0558f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rotation:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10 4a8 8 0 1 0 8 8" stroke="#ef8a1e" stroke-width="1.8" stroke-linecap="round"/><path d="M10 1.5L10 4l2.5-2.2" stroke="#ef8a1e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13h3" stroke="#ef8a1e" stroke-width="1.6" stroke-linecap="round"/></svg>',
    datacenter:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="#13a3c7" stroke-width="1.7"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="#13a3c7" stroke-width="1.7"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="#13a3c7" stroke-width="1.7"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="#13a3c7" stroke-width="1.7"/></svg>'
  };
  return M[name]||'';
}
function svgDot(color){
  return '<svg class="dg-ic" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="'+color+'" opacity=".18"/><circle cx="7" cy="7" r="3.2" fill="'+color+'"/></svg>';
}

function renderHome(){
  // 1) 我的资产速览
  let mv=0, pl=0, day=0;
  state.hold.forEach(h=>{ const q=state.quotes[h.code]; const fd=state.fundData[h.code]; const cur=q?q.price:(fd?fd.latest:0); if(cur){ mv+=cur*h.shares; pl+=(cur-h.cost)*h.shares; if(h.kind==='fund'){ if(fd&&fd.prev) day+=h.shares*(fd.latest-fd.prev); } else { if(q&&q.changePct!=null) day+=cur*h.shares*q.changePct/(100+q.changePct); } } });
  const cost=mv-pl;
  const assetEl=$('homeAsset');
  if(assetEl){
    assetEl.innerHTML='<div class="ov-card"><span class="ov-mark">'+svgMark('cash')+'</span><div class="ov-info"><span class="ov-v">'+fmt(mv)+'</span><span class="ov-k">持仓总市值</span></div></div>'
      +'<div class="ov-card"><span class="ov-mark">'+svgMark('profit')+'</span><div class="ov-info"><span class="ov-v '+(cls(pl))+'">'+fmt(pl)+'</span><span class="ov-k">总浮动盈亏 ('+pct(cost?pl/cost*100:0)+')</span></div></div>'
      +'<div class="ov-card"><span class="ov-mark">'+svgMark('day')+'</span><div class="ov-info"><span class="ov-v '+(cls(day))+'">'+fmt(day)+'</span><span class="ov-k">今日盈亏</span></div></div>'
      +'<div class="ov-card"><span class="ov-mark">'+svgMark('count')+'</span><div class="ov-info"><span class="ov-v">'+state.hold.length+' / '+state.watch.length+'</span><span class="ov-k">持仓 / 自选</span></div></div>';
  }
  // 1.5) 持仓总览（市值/收益率/仓位分布/止盈止损状态）—— 默认首页核心
  if(typeof renderHomeHold==='function'){ try{ renderHomeHold(); }catch(e){ console.warn('renderHomeHold err', e); } }
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
  // 3) 快捷入口（白底卡片 + 左侧色条 + 自绘 SVG 徽标，不贴图标）
  const mods=[{v:'market',mk:'market',t:'行情看板',d:'K线+五档盘口+各类指标',g:'blue'},{v:'hold',mk:'hold',t:'持仓管理',d:'成本录入·盈亏自动算',g:'green'},{v:'fund',mk:'fund',t:'机会精选',d:'主动基金·半年维度筛选',g:'purple'},{v:'analysis',mk:'analysis',t:'建仓分析',d:'集合大师思维框架研判',g:'orange'},{v:'sectors',mk:'sectors',t:'行业趋势扫描',d:'哪个行业在向上',g:'cyan'},{v:'fundAnalysis',mk:'fundAnalysis',t:'基金深度分析',d:'净值诊断·风险体检',g:'pink'},{v:'rotation',mk:'rotation',t:'行业温度计',d:'只看冷热·不构成推荐',g:'orange'},{v:'datacenter',mk:'datacenter',t:'可靠数据中心',d:'质量/估值/分散/定投',g:'cyan'}];
  const mg=$('homeMods');
  if(mg){ mg.innerHTML=mods.map(m=>'<div class="modcard mod-'+m.g+'" data-go="'+m.v+'"><div class="mi">'+svgMark(m.mk)+'</div><div class="mt">'+m.t+'</div><div class="md">'+m.d+'</div></div>').join(''); mg.querySelectorAll('.modcard').forEach(c=>c.onclick=()=>goView(c.dataset.go)); }
  // 3.5) 今日要点侧栏
  if(typeof renderHomeDigest==='function'){ try{ renderHomeDigest(); }catch(e){ console.warn('renderHomeDigest err', e); } }
  // 4) 行业全景聚合面板（进入工作台即自动拉取；失败/限流时内部诚实降级）
  if(typeof renderIndustryPanorama==='function') renderIndustryPanorama();
}

/* 首页「今日要点」侧栏：今日盈亏 / 到点提醒 / 复盘生成 / 持仓集中度 */
function renderHomeDigest(){
  const el=$('homeDigestBody'); if(!el) return;
  const items=[];
  // 今日盈亏
  let mv=0, day=0;
  state.hold.forEach(h=>{ const q=state.quotes[h.code]; const fd=state.fundData[h.code]; const cur=q?q.price:(fd?fd.latest:0); if(cur){ mv+=cur*h.shares; if(h.kind==='fund'){ if(fd&&fd.prev) day+=h.shares*(fd.latest-fd.prev); } else { if(q&&q.changePct!=null) day+=cur*h.shares*q.changePct/(100+q.changePct); } } });
  if(state.hold.length){
    items.push({dot:day>=0?'#1f9d55':'#e23b3b', cls:day>=0?'dg-ok':'dg-alert', tx:'今日盈亏 <b class="'+(cls(day))+'">'+fmt(day)+'</b>'});
  } else {
    items.push({dot:'#2f6fed', cls:'dg-info', tx:'暂无持仓，去「持仓管理」录入'});
  }
  // 到点提醒（止盈/止损）
  let hit=0;
  state.hold.forEach(h=>{ const p=(typeof priceOf==='function')?priceOf(h.code):0; if(!(p>0)) return;
    if(h.target>0 && p>=h.target) hit++;
    else if(h.stop>0 && p<=h.stop) hit++;
  });
  if(hit>0) items.push({dot:'#e23b3b', cls:'dg-alert', tx:'<b>'+hit+'</b> 只持仓到止盈/破止损价，注意纪律'});
  else items.push({dot:'#1f9d55', cls:'dg-ok', tx:'今日无持仓触发止盈/止损线'});
  // 复盘生成
  let reviewed=false;
  try{ const arr=JSON.parse(localStorage.getItem('reviewArchive')||'[]'); const td=(typeof todayStr==='function')?todayStr():''; reviewed=arr.some(r=>r.date===td); }catch(e){}
  if(reviewed) items.push({dot:'#1f9d55', cls:'dg-ok', tx:'今日复盘已生成，可回看'});
  else items.push({dot:'#d9a514', cls:'dg-warn', tx:'今日复盘未生成，收盘后可点「每日复盘」'});
  // 持仓集中度
  if(state.hold.length){
    let tot=0; const ms=state.hold.map(h=>{ const p=(typeof priceOf==='function')?priceOf(h.code):0; const m=p*h.shares; tot+=m; return m; });
    const maxPct=tot?Math.max.apply(null,ms)/tot*100:0;
    const cv=(maxPct>60)?'#e23b3b':(maxPct>40?'#d9a514':'#1f9d55');
    const cvc=(maxPct>60)?'dg-alert':(maxPct>40?'dg-warn':'dg-ok');
    items.push({dot:cv, cls:cvc, tx:'最大持仓占比 <b>'+maxPct.toFixed(0)+'%</b>'+(maxPct>40?'（偏集中）':'（较分散）')});
  }
  el.innerHTML=items.map(it=>'<div class="dg-item '+it.cls+'">'+svgDot(it.dot)+'<span class="dg-tx">'+it.tx+'</span></div>').join('');
}

function refreshQuotes(cb){
  const stockCodes = [...new Set([...state.watch.filter(w=>w.kind==='stock'), ...state.hold.filter(h=>h.kind==='stock')].map(x=>x.code))];
  let fired=false; const done=()=>{ if(fired)return; fired=true; onQuotesUpdated(); if(typeof cb==='function') cb(); };
  if(stockCodes.length){
    const url='https://qt.gtimg.cn/q='+stockCodes.join(',')+'&_='+Date.now();
    const t=setTimeout(()=>{ useDemoQuotes(stockCodes); done(); }, 8000);
    fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); }).then(buf=>{
      clearTimeout(t);
      const text = new TextDecoder('gb18030').decode(buf);
      const d=parseTencent(text);
      if(Object.keys(d).length===0){ useDemoQuotes(stockCodes); done(); return; }
      Object.assign(state.quotes, d);
      // 用已缓存的 K 线校准行情价格单位：腾讯 qt 对 ETF 有时返回“分”、有时返回“元”，
      // 不能按代码前缀硬除，必须以 K 线（fqkline，单位元）为基准自动对齐。
      Object.keys(d).forEach(c=>{ if(state.quotes[c]) calibrateQuoteToKline(c, state.quotes[c]); });
      setDemo(false); setDataStatus('ok');
      if(window.Acc) Acc.afterQuotes();   // 准确性基建：行情时间戳+过期检查+多源校验
      done();
    }).catch(err=>{ clearTimeout(t); useDemoQuotes(stockCodes); done(); });
  } else {
    done();
  }
  fundCodesToLoad().forEach(c=>{ if(needsFund(c)) loadFund(c); });
  refreshIndices();
  $('updTime').textContent = '更新 '+ts();
}
function ensureStockQuote(code){
  return new Promise(res=>{
    if(state.quotes[code] && state.quotes[code].price) return res(true);
    const url='https://qt.gtimg.cn/q='+code+'&_='+Date.now();
    fetch(url).then(r=>r.arrayBuffer()).then(buf=>{
      const text=new TextDecoder('gb18030').decode(buf);
      const d=parseTencent(text);
      if(d[code]){ state.quotes[code]=d[code]; calibrateQuoteToKline(code, state.quotes[code]); onQuotesUpdated(); }
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
  if(typeof checkHoldAlerts==='function') checkHoldAlerts();   // 止盈止损到点提醒（每天每持仓一次）
  if(window.DataCalibrator){ DataCalibrator.reportQuotes(DataCalibrator.checkQuotes(state.quotes)); if(!state.demo) DataCalibrator.clearFetch(); }
}

// 交易时段判断（A股）：周一~周五 9:15-11:30 / 13:00-15:00
function isTradingNow(){
  const d=new Date(), day=d.getDay();
  if(day===0||day===6) return false;
  const hm=d.getHours()*60+d.getMinutes();
  return (hm>=555 && hm<=690) || (hm>=780 && hm<=900);
}
// 用实时行情(qt.gtimg.cn)合成/更新“今日”K线bar。
// 根因：腾讯 fqkline 日线接口在收盘后数小时才发布当日bar（实测 16:02 末日仍停在上一交易日），
// 而实时行情接口盘中/收盘后即更新到今日。当缓存末日<今天(或今日bar需随行情刷新)时，
// 用行情的 开/高/低/收 合成今日bar补入，让K线“看得到今天”。fqkline 后续发布真实当日bar后，
// refreshOneKline 的合并逻辑按 date 匹配覆盖本合成bar。
function ensureTodayBar(code, period){
  const key = normCode(code)+period;
  const cached = state.kcache[key];
  if(!cached || !cached.length || cached._demo) return false;
  const today = todayStr();
  const lastBar = klineLastDate(cached);
  if(lastBar > today) return false;                 // 已有比今天更新的bar（异常），不动
  let q = state.quotes[code] || state.quotes[normCode(code)] || state.quotes[key.slice(0,-1)];
  if(!q || !q.time) return false;
  q = calibrateQuoteToKline(code, q);               // 先对齐 K 线单位：有些 ETF 返回“分”、有些返回“元”
  const qd = String(q.time).replace(/\D/g,'').slice(0,8);
  if(qd !== today.replace(/-/g,'')) return false;   // 实时行情不是今日（周末/停牌/非交易），不合成，防误植
  const o=+q.open, h=+q.high, l=+q.low, c=+q.price, v=+(q.volume||q.amount||0);
  if(!(o>0 && h>0 && l>0 && c>0 && h>=o && h>=c && l<=o && l<=c)) return false;
  if(lastBar===today && cached._todaySynthAt === q.time) return false; // 已用该行情时间戳合成过，跳过
  const existing = cached.find(x=>x.date===today);
  if(existing){ existing.open=o; existing.high=h; existing.low=l; existing.close=c; existing.vol=v; }
  else { cached.push({date:today, open:o, high:h, low:l, close:c, vol:v}); cached.sort((a,b)=>a.date<b.date?-1:1); }
  cached._todaySynthAt = q.time;
  markKlineDate(cached);
  return true;
}

// 跨日/盘中：把「所有已缓存、但最新 bar 日期 < 今天」的K线补刷到今天（修复“除选中股外其余K线停在上一交易日”）
// 旧版仅刷选中股，导致自选/机会列表的K线永远停在批量拉取那一刻；现改为按缓存里每一只标的逐个补刷。
// 分两类：① 真实历史缺今日bar（腾讯fqkline常滞后数小时）→ 网络 tailOnly 拉取 + 行情兜底合成；
//         ② 今日bar已存在、但实时行情有更新（盘中跳动/收盘后最终价）→ 仅用行情刷新今日bar，不拉网络。
// 分批限流(每批4只、间隔120ms)避免触发腾讯同IP限流；命中限流返回演示数据则先用行情兜底、否则3秒后重试一次。
function refreshKlinesToToday(){
  if(refreshKlinesToToday._busy) return;
  const now=Date.now(); const today=todayStr();
  const tasks=[], sync=[];
  for(const key in state.kcache){
    if(!/[dw]$/.test(key)) continue;                 // 仅处理日/周K
    const cached=state.kcache[key];
    if(!cached||!cached.length||cached._demo) continue;
    const code=key.slice(0,-1), period=key.slice(-1);
    const w=(state.watch.find(x=>x.code===code)||state.hold.find(x=>x.code===code));
    if(w&&w.kind==='fund') continue;                 // 基金无K线
    const lastBar = klineLastDate(cached);
    const q = state.quotes[code] || state.quotes[normCode(code)];
    const qToday = q && q.time && String(q.time).replace(/\D/g,'').slice(0,8) === today.replace(/-/g,'');
    if(lastBar < today){
      tasks.push({code,period,cached});              // 真实历史缺今日bar（fqkline滞后）→ 网络补拉 + 行情兜底合成
    } else if(lastBar === today && qToday && cached._todaySynthAt !== q.time){
      sync.push({code,period,cached});               // 今日bar已在，行情有更新（盘中/收盘后）→ 仅用行情刷新
    }
  }
  const total = tasks.length + sync.length;
  if(!total) return;
  refreshKlinesToToday._busy=true;
  console.log('[K线刷新] 启动补刷，标的数=', total, '(网络='+tasks.length+', 行情合成='+sync.length+')', 'today=', today);
  sync.forEach(({code,period,cached})=> ensureTodayBar(code, period));   // 行情合成无网络，先快处理
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
  const today=todayStr();
  const redrawIfSel=()=>{ if(code===state.selected){ if(state.view==='analysis') renderAnalysis(); else if(state.view==='market'||state.view==='detail') renderDetail(); } };
  console.log('[K线刷新] 补刷', code, period, '当前最新=', klineLastDate(cached), '目标>=', today);
  loadKline(code, period, (tail, isDemo)=>{
    let updated=false;
    if(!(isDemo||!tail||!tail.length)){
      tail.forEach(b=>{
        const idx=cached.findIndex(x=>x.date===b.date);
        if(idx>=0){ cached[idx]=b; updated=true; }     // 真实当日bar发布后按 date 覆盖合成bar
        else if(b.date>cached[cached.length-1].date){ cached.push(b); updated=true; }
      });
      if(updated) cached.sort((a,b)=>a.date<b.date?-1:1);
    } else {
      console.log('[K线刷新] 未拿到数据', code, period, isDemo?'演示':'空', '→先用实时行情兜底');
    }
    // 用实时行情兜底合成/更新今日bar（fqkline滞后时无今日bar，行情是今日唯一来源；发布后按 date 覆盖）
    const changed=ensureTodayBar(code, period);
    markKlineDate(cached);
    if(updated||changed){ const nl=klineLastDate(cached); console.log('[K线刷新] 完成', code, period, '最新=', nl, nl>=today?'✓':'✗'); redrawIfSel(); }
    if(window.DataCalibrator) DataCalibrator.reportKline(code, DataCalibrator.checkKline(code, cached));
    // 既无真实当日bar、行情也无法合成（限流/无数据）→ 3秒后重试一次，提升自愈
    if(!(updated||changed)){
      if(!refreshOneKline._retry) refreshOneKline._retry={};
      const rk=code+period;
      if(!refreshOneKline._retry[rk]){ refreshOneKline._retry[rk]=true; setTimeout(()=>{ refreshOneKline._retry[rk]=false; refreshOneKline(code, period, cached); }, 3000); }
    }
  }, {tailOnly:true, ignoreReqKey:true});
}

