/* =========================================================================
 * dict.js — 二期 指标词典（大白话版）
 * 把工作台里出现的指标/概念用一句大白话讲清楚：是什么、怎么用、别踩什么坑。
 * 内容为科普，不构成投资建议。
 * ========================================================================= */
var INDICATOR_DICT = [
  { cat:'技术', key:'kdj', name:'KDJ', plain:'随机指标，帮你看「买卖时机」：K/D 线 80 以上=偏热容易回调，20 以下=偏冷容易反弹；J 线最灵敏。', how:'低位金叉（K 上穿 D）常被当作买入参考，高位死叉当心回调。', caution:'震荡市好用；单边大涨大跌时会「钝化」失灵，别死磕。' },
  { cat:'技术', key:'rsi', name:'RSI', plain:'相对强弱指标，衡量「涨得猛不猛」：>70 偏热（涨多了），<30 偏冷（跌多了）。', how:'过热时别追、过冷时留意机会；和 KDJ 一起看更稳。', caution:'强趋势里 RSI 可以长期在 70 以上，不能机械当卖点。' },
  { cat:'技术', key:'macd', name:'MACD', plain:'趋势指标：DIF 上穿 DEA=金叉（多头、红柱变长=上涨动能强），下穿=死叉（空头）。', how:'看「金叉死叉 + 柱子方向」判断趋势在转好还是转坏。', caution:'滞后指标——金叉出现时往往已经涨了一段，别追高。' },
  { cat:'技术', key:'ma', name:'均线 MA', plain:'N 天收盘均价连成的线：价格在均线上方=趋势偏多，下方=偏空。20 日=月线，60 日=季线。', how:'价格站上 20 日线且均线向上=中期趋势健康；跌破=转弱信号。', caution:'均线是「后视镜」，反映过去不预测未来。' },
  { cat:'技术', key:'boll', name:'布林带 BOLL', plain:'上下轨=价格「正常波动区间」：触上轨偏热、触下轨偏冷；带宽收窄=要变盘的前兆。', how:'上轨附近别追、下轨附近留意；开口放大=波动加大。', caution:'碰到上/下轨不代表一定反转，可能沿着轨道一直走。' },
  { cat:'估值', key:'pct', name:'估值分位/温度计', plain:'当前价格在过去 N 年（工作台用近250日≈1年）区间里的位置：<30% 便宜、>70% 贵。', how:'便宜≠马上涨，贵≠马上跌；它是「贵不贵」的温度计，不是预言机。', caution:'不同时间窗口结果不同，只看一种窗口会误判。' },
  { cat:'估值', key:'pe', name:'市盈率 PE', plain:'股价÷每股盈利，通俗说「按当前赚钱速度，几年回本」。越低越便宜。', how:'和同行业比、和历史比才有意义；高增长公司 PE 高也正常。', caution:'亏损企业 PE 无意义；不同行业不能直接比。' },
  { cat:'估值', key:'pb', name:'市净率 PB', plain:'股价÷每股净资产，重资产行业（银行/地产/周期）更常用。PB<1 常被叫「破净」。', how:'周期行业底部常伴随低 PB，但低 PB 也可能「价值陷阱」。', caution:'净资产可能缩水（减值），破净≠一定安全。' },
  { cat:'风险', key:'drawdown', name:'最大回撤', plain:'历史上从最高点跌到最低点的最大幅度：回撤 30% 意味着最惨时腰斩到只剩七成。', how:'回撤大的品种拿起来难受，先问自己扛不扛得住。', caution:'回撤是历史事实，不代表未来不会更大。' },
  { cat:'风险', key:'sharpe', name:'夏普比率', plain:'（收益 − 无风险利率）÷ 波动：衡量「每冒一分风险，换回多少收益」。越高越划算。', how:'同类型产品比夏普才有意义；负夏普=收益配不上风险。', caution:'只看最近一段时间的夏普容易被短期行情误导。' },
  { cat:'风险', key:'vol', name:'波动率', plain:'价格上下波动的剧烈程度：波动大=短期可能大赚也可能大亏，心脏要受得了。', how:'用波动率判断「这个仓位晚上睡得着吗」。', caution:'波动率和风险不完全等同——长期向上的波动是「上车机会」。' },
  { cat:'资金', key:'flow', name:'主力资金净流入', plain:'大单（超大单+大单）净买入的金额：连续净流入=大资金在进场，连续净流出=在撤退。', how:'配合价格看：资金流入+价格涨=共识；资金流入+价格不涨=可能有分歧。', caution:'滞后/同步指标，不是预言机；小盘股大单拆单很常见。' },
  { cat:'资金', key:'turnover', name:'换手率', plain:'当日成交股数÷流通股数，衡量活跃度：高换手=交投热。', how:'暴涨后换手率飙升常是「获利盘出逃」信号，留意。', caution:'新股/次新股天然高换手，别直接套阈值。' }
];
function dictCats(){ const out=[]; INDICATOR_DICT.forEach(d=>{ if(out.indexOf(d.cat)<0) out.push(d.cat); }); return out; }
/* 词典分类 → CSS 色点（自绘几何标记，替代 emoji 图标） */
var DICT_DOT = { '技术':'#2f6fed', '估值':'#e07612', '风险':'#e01f22', '资金':'#15925a' };
function dictCardHtml(d){
  var dot = DICT_DOT[d.cat] || 'var(--accent)';
  return '<div class="dict-card"><div class="dict-h"><span class="dict-dot" style="background:' + dot + '"></span><b>' + d.name + '</b> <span class="dict-cat">' + d.cat + '</span></div>'
    + '<div class="dict-plain">' + d.plain + '</div>'
    + '<div class="dict-row"><span class="dict-k">怎么用</span>' + d.how + '</div>'
    + '<div class="dict-row warn"><span class="dict-k">别踩坑</span>' + d.caution + '</div></div>';
}
function renderDict(){
  const el = $('dictBody'); if(!el) return;
  const kw = String(($('dictSearch') && $('dictSearch').value) || '').trim().toLowerCase();
  const cat = ($('dictCat') && $('dictCat').value) || 'all';
  let list = INDICATOR_DICT;
  if(cat !== 'all') list = list.filter(d => d.cat === cat);
  if(kw) list = list.filter(d => (d.name + d.plain + d.how + d.caution).toLowerCase().indexOf(kw) >= 0);
  el.innerHTML = list.length
    ? '<div class="dict-grid">' + list.map(dictCardHtml).join('') + '</div>'
    : '<div class="pan-sub-note">没找到「' + escapeHtml(kw) + '」，换个词试试。</div>';
}
function renderDictCatSel(){
  const sel = $('dictCat'); if(!sel) return;
  sel.innerHTML = '<option value="all">全部分类</option>' + dictCats().map(c => '<option value="' + c + '">' + c + '</option>').join('');
}
