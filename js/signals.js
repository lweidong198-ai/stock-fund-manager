/* =========================================================================
 * signals.js — 一期③ 多维信号灯 + 买卖检查清单（钱管家工作台 v1）
 *
 * 四盏灯（纯描述，不预测）：
 *   估值灯：近250日价格/净值分位  <30% 绿(便宜) / >70% 红(贵) / 中间黄
 *   资金灯：行业ETF近5日主力净流入（东财，源不可达→灰并诚实标注）
 *   技术灯：站上20日线 + MACD多头 → 绿；跌破20日线/空头 → 红
 *   趋势灯：近60日涨幅 vs 沪深300 → 跑赢绿 / 跑输红
 * 买卖检查清单：信号灯 + 追高检查 + 逐条勾选确认（情绪刹车，不代决策）
 * 全部能力降级友好：任一依赖缺失只把对应灯置灰，绝不抛错。
 * ========================================================================= */

/* —— 纯计算辅助（可单测） —— */
function smaOf(closes, n){
  if(!closes || closes.length < n) return null;
  let s = 0; for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}
function percentileOf(closes, days){
  if(!closes || closes.length < 2) return null;
  const w = closes.slice(-days), cur = w[w.length - 1];
  const lo = Math.min.apply(null, w), hi = Math.max.apply(null, w);
  return hi > lo ? (cur - lo) / (hi - lo) : 0.5;
}
function klinePctFromArray(closes, n){
  if(!closes || closes.length < n + 1) return null;
  const a = closes[closes.length - n - 1], b = closes[closes.length - 1];
  return (b - a) / a * 100;
}

/* 沪深300 近60日涨幅（趋势灯基准，缓存一次） */
var __bench60Cache = null;
async function loadBench60(){
  if(__bench60Cache != null) return __bench60Cache;
  let b = null;
  try{
    let bk = (typeof loadKlineP === 'function') ? await loadKlineP('sh000300', 'd') : null;
    if(!(bk && bk.length) && typeof fetchEMKline === 'function') bk = await fetchEMKline('1.000300');
    if(bk && typeof klinePct === 'function') b = klinePct(bk, 60);
  }catch(e){ b = null; }
  __bench60Cache = b;
  return b;
}
/* 资金流相关能力在行业全景模块的 __pan 命名空间内，此处按需解析（裸名不共享作用域） */
function _panFn(name){
  try{
    if(typeof window !== 'undefined' && window.__pan && typeof window.__pan[name] === 'function') return window.__pan[name];
  }catch(e){}
  return null;
}

/* 取某代码的收盘价序列：基金→净值序列；股票/ETF→日K缓存 */
function closesOf(code){
  if(typeof isFundKind === 'function' && isFundKind(code)){
    const bare = String(code).replace(/^(sz|sh|hk|us)/i, '');
    const fd = state && state.fundData && state.fundData[bare];
    return (fd && fd.nav && fd.nav.length) ? fd.nav.map(p => p.nav) : null;
  }
  const key = (typeof normCode === 'function' ? normCode(code) : code) + 'd';
  const kl = state && state.kcache && state.kcache[key];
  return (kl && kl.length && !kl._demo) ? kl.map(x => x.close) : null;
}
async function ensureKline(code){
  if(typeof isFundKind === 'function' && isFundKind(code)) return;   // 基金走净值，无需K线
  const key = (typeof normCode === 'function' ? normCode(code) : code) + 'd';
  const have = state && state.kcache && state.kcache[key];
  if(have && have.length && !have._demo) return;
  if(typeof loadKlineP !== 'function') return;
  try{
    const k = await loadKlineP(code, 'd');
    if(k && k.length && !k._demo && state && state.kcache) state.kcache[key] = k;
  }catch(e){}
}

/* —— 四灯计算：返回 {val,fund,tech,trend}，每灯 {state,text,detail} —— */
async function signalLights(code){
  const isF = (typeof isFundKind === 'function') && isFundKind(code);
  await ensureKline(code);
  const closes = closesOf(code);
  const out = {
    val:  { state:'gray', text:'—', detail:'估值数据不足（需≥60条数据）' },
    fund: { state:'gray', text:'—', detail:'资金流数据不足' },
    tech: { state:'gray', text:'—', detail:'技术数据不足（需≥60条数据）' },
    trend:{ state:'gray', text:'—', detail:'趋势数据不足（需≥61条数据）' }
  };
  /* 估值灯 */
  if(closes && closes.length >= 60){
    const p = percentileOf(closes, 250);
    if(p != null){
      const pctTxt = '分位 ' + Math.round(p * 100) + '%';
      if(p < 0.30) out.val = { state:'green', text:pctTxt, detail:'便宜区间（近250日历史 30% 以下）' };
      else if(p > 0.70) out.val = { state:'red', text:pctTxt, detail:'偏贵区间（近250日历史 70% 以上）' };
      else out.val = { state:'mid', text:pctTxt, detail:'中性区间（不便宜也不算贵）' };
    }
  }
  /* 技术灯 */
  if(closes && closes.length >= 60){
    const cur = closes[closes.length - 1], ma20 = smaOf(closes, 20);
    let macdState = null;
    if(typeof calcMacdFull === 'function'){
      try{ const m = calcMacdFull(closes); macdState = m.state[m.state.length - 1]; }catch(e){}
    }
    if(ma20 != null){
      const above = cur >= ma20;
      const bull = (macdState === 'bull' || macdState === 'crossUp');
      const bear = (macdState === 'bear' || macdState === 'crossDown');
      if(above && bull) out.tech = { state:'green', text:'站上20日线·MACD多头', detail:'现价高于20日均线，动能指标向上' };
      else if(!above && bear) out.tech = { state:'red', text:'跌破20日线·MACD空头', detail:'现价低于20日均线，动能指标向下' };
      else if(above) out.tech = { state:'mid', text:'站上20日线但MACD走弱', detail:'价格在均线上方，但动能转弱，留意' };
      else out.tech = { state:'red', text:'跌破20日线', detail:'现价低于20日均线' };
    }
  }
  /* 趋势灯 */
  if(closes && closes.length >= 61){
    const c60 = klinePctFromArray(closes, 60);
    const b60 = await loadBench60();
    if(c60 != null && b60 != null){
      const rel = c60 - b60;
      out.trend = {
        state: rel >= 0 ? 'green' : 'red',
        text: (rel >= 0 ? '跑赢' : '跑输') + '沪深300 ' + (rel >= 0 ? '+' : '') + rel.toFixed(1) + 'pp',
        detail: '近60日自身 ' + c60.toFixed(1) + '% vs 沪深300 ' + b60.toFixed(1) + '%'
      };
    }
  }
  /* 资金灯：仅行业ETF（东财近5日主力净流入，源被拦→灰+诚实标注） */
  if(!isF){
    const ff = _panFn('loadFundFlowDays');
    const bare = String(code).replace(/^(sh|sz)/, '');
    let inPool = false;
    if(typeof INDUSTRY_POOL !== 'undefined'){
      inPool = INDUSTRY_POOL.some(x => String(x.code || '').replace(/^(sh|sz)/, '') === bare);
    }
    if(inPool && ff){
      out.fund = { state:'gray', text:'计算中…', detail:'近5日主力净流入（东方财富）' };
      const contPosFn = _panFn('contPos');
      await new Promise(res => {
        try{
          ff(code, 5, function(r){
            if(r && !r.err && r.days && r.days.length){
              const last = r.days[r.days.length - 1];
              const cont = contPosFn ? contPosFn(r.days) : 0;
              const sumTxt = (r.sum >= 0 ? '+' : '') + (typeof fmtMoney === 'function' ? fmtMoney(r.sum) : r.sum);
              if(cont >= 2) out.fund = { state:'green', text:'连续净流入 ' + cont + ' 日', detail:'近5日主力累计 ' + sumTxt };
              else if(last > 0) out.fund = { state:'mid', text:'当日净流入', detail:'近5日主力累计 ' + sumTxt };
              else if(last < 0) out.fund = { state:'red', text:'净流出', detail:'最新一日主力净流出 · 近5日累计 ' + sumTxt };
              else out.fund = { state:'gray', text:'—', detail:'近5日主力净流入数据' };
            } else {
              out.fund = { state:'gray', text:'源不可达', detail:'资金流源(东方财富)当前连不上，此灯无法判断' };
            }
            res();
          });
        }catch(e){ res(); }
      });
    } else if(!ff){
      out.fund = { state:'gray', text:'—', detail:'资金流模块未就绪' };
    } else {
      out.fund = { state:'gray', text:'—', detail:'资金灯仅对行业ETF有效' };
    }
  }
  return out;
}

/* —— 渲染四灯 —— */
function signalRow(label, cfg){
  const icon = cfg.state === 'green' ? '🟢' : (cfg.state === 'red' ? '🔴' : (cfg.state === 'mid' ? '🟡' : '⚪'));
  return '<div class="sig-row ' + cfg.state + '"><div class="sig-ic">' + icon + '</div>'
    + '<div class="sig-main"><div class="sig-t">' + label + '<span class="sig-v">' + cfg.text + '</span></div>'
    + '<div class="sig-d">' + cfg.detail + '</div></div></div>';
}
function renderSignalLights(elId, code){
  const el = elId ? document.getElementById(elId) : null;
  if(!el) return;
  el.innerHTML = '<div class="sig-load">信号灯计算中…（约1-3秒）</div>';
  signalLights(code).then(function(l){
    if(!document.body || !document.body.contains(el)) return;
    const rows = [
      { key:'val', label:'估值灯' },
      { key:'fund', label:'资金灯' },
      { key:'tech', label:'技术灯' },
      { key:'trend', label:'趋势灯' }
    ];
    el.innerHTML = rows.map(r => signalRow(r.label, l[r.key])).join('');
  }).catch(function(){ el.innerHTML = '<div class="sig-load">信号灯计算失败，稍后自动重试</div>'; });
}

/* —— 买卖检查清单 —— */
function openChecklist(code, side){
  const el = $('checkModal'); if(!el) return;
  const nm = (typeof nameOf === 'function') ? nameOf(code) : code;
  el.style.display = 'block';
  el.dataset.side = side; el.dataset.code = code;
  $('checkTitle').textContent = (side === 'buy' ? '🟢 买入前检查' : '🔴 卖出前检查') + ' · ' + nm + ' (' + code + ')';
  $('checkStrip').innerHTML = '<div class="sig-load">信号灯计算中…</div>';
  renderSignalLights('checkStrip', code);
  /* 追高检查 */
  let extra = '';
  const closes = closesOf(code);
  if(closes && closes.length >= 6){
    const c5 = klinePctFromArray(closes, 5);
    if(c5 != null){
      if(c5 > 12) extra = '<div class="ck-warn">⚠ 近5日已涨 <b>' + c5.toFixed(1) + '%</b>，明显追高风险，建议等回调再看</div>';
      else if(c5 > 5) extra = '<div class="ck-mid">近5日涨 ' + c5.toFixed(1) + '%，已不算低位，确认不是追高</div>';
      else extra = '<div class="ck-ok">近5日 ' + c5.toFixed(1) + '%，无明显追高</div>';
    }
  }
  $('checkExtra').innerHTML = extra || '<div class="ck-ok">追高数据不足，自行确认</div>';
  const items = (side === 'buy') ? [
    '这笔钱 1 年内不需要动用（能拿得住）',
    '已想好止损位（建议 ≤ 成本−8%，或近250日低点）',
    '买入理由写得出一句话（不是怕踏空 / 看别人买）'
  ] : [
    '卖的理由是「到了目标 / 止损」，不是「跌怕了 / 涨够了」',
    '卖出后这笔钱有明确去处（不是空仓焦虑）'
  ];
  $('checkItems').innerHTML = items.map(function(t, i){
    return '<label class="ck-item"><input type="checkbox" data-ci="' + i + '"> ' + t + '</label>';
  }).join('');
}
function closeChecklist(){
  const el = $('checkModal'); if(el) el.style.display = 'none';
}
function confirmChecklist(){
  const el = $('checkModal'); if(!el) return;
  const side = el.dataset.side || 'buy';
  const boxes = el.querySelectorAll('input[data-ci]');
  let checked = 0; boxes.forEach(function(b){ if(b.checked) checked++; });
  if(checked < boxes.length){
    if(typeof toast === 'function') toast('还有 ' + (boxes.length - checked) + ' 项没勾，再想想？');
    return;
  }
  closeChecklist();
  if(typeof toast === 'function') toast('已确认计划：纪律比预测重要，按计划执行。');
}
