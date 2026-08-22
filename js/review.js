/* =========================================================================
 * review.js — 一期④ 一键复盘卡 + 每日自动摘要（钱管家工作台 v1）
 *
 * 复盘卡内容（纯事实描述，不构成建议）：
 *   大盘：上证/深成指/创业板/沪深300 当日涨跌（腾讯指数）
 *   持仓：总市值/浮动盈亏/当日盈亏/笔数 + 各持仓盈亏快照
 *   板块：行业池当日领涨/领跌 Top5 + 行业平均涨跌
 * 每日自动存档 localStorage（30 天滚动），收盘后自动生成，随时可手动重新生成。
 * ========================================================================= */
var REVIEW_KEY = 'qr_review_v1';
function loadReviews(){ try{ return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}') || {}; }catch(e){ return {}; } }
function saveReviews(o){ try{ localStorage.setItem(REVIEW_KEY, JSON.stringify(o)); }catch(e){} }
function pruneReviews(o){ const ks = Object.keys(o).sort(); while(ks.length > 30) delete o[ks.shift()]; return o; }

/* 持仓汇总 + 明细快照 */
function reviewHoldRows(){
  if(typeof state === 'undefined' || !state || !state.hold) return { rows:[], mv:0, pl:0, plp:0, day:0, cost:0 };
  let mv = 0, pl = 0, day = 0, cost = 0; const rows = [];
  state.hold.forEach(h => {
    const p = (typeof priceOf === 'function') ? priceOf(h.code) : 0;
    const n = h.shares || 0, c = h.cost || 0;
    if(!(p > 0)) return;
    const m = n * p, co = n * c; mv += m; pl += m - co; cost += co;
    let d = 0;
    if(typeof isFundKind === 'function' && isFundKind(h.code)){
      const bare = String(h.code).replace(/^(sz|sh|hk|us)/i, '');
      const fd = state.fundData && state.fundData[bare];
      if(fd && fd.prev) d = n * (fd.latest - fd.prev);
    } else {
      const q = state.quotes && state.quotes[h.code];
      if(q && q.changePct != null) d = m * q.changePct / (100 + q.changePct);
    }
    day += d;
    rows.push({ code:h.code, name:(typeof nameOf==='function')?nameOf(h.code):h.code, mv:m, pl:m-co, plp:co?((m-co)/co*100):0, day:d });
  });
  return { rows, mv, pl, plp: cost ? pl / cost * 100 : 0, day, cost };
}
/* 行业池领涨/领跌（腾讯行情，必通） */
function reviewIndustry(){
  const out = { leaders:[], laggers:[], avg:null };
  if(typeof INDUSTRY_POOL === 'undefined') return out;
  const rows = []; let sum = 0, cnt = 0;
  INDUSTRY_POOL.forEach(x => {
    const q = state.quotes && state.quotes[normCode(x.code)];
    if(q && q.changePct != null){ rows.push({ name:x.name, code:x.code, day:q.changePct }); sum += q.changePct; cnt++; }
  });
  rows.sort((a, b) => b.day - a.day);
  out.leaders = rows.slice(0, 5); out.laggers = rows.slice(-5).reverse(); out.avg = cnt ? sum / cnt : null;
  return out;
}
/* 收集当日复盘数据 */
function reviewCollect(){
  const o = { date: todayStr(), at: new Date().toTimeString().slice(0, 5) };
  const idx = {};
  if(typeof indexQuotes !== 'undefined'){
    [['sh000001','上证'],['sz399001','深成指'],['sz399006','创业板'],['sh000300','沪深300']].forEach(function(pair){
      const q = indexQuotes[pair[0]]; if(q && q.changePct != null) idx[pair[1]] = q.changePct;
    });
  }
  o.bench = idx;
  const h = reviewHoldRows();
  o.hold = { mv:h.mv, pl:h.pl, plp:h.plp, day:h.day, count:(state && state.hold) ? state.hold.length : 0 };
  o.holdRows = h.rows.slice(0, 8);
  const ind = reviewIndustry();
  o.leaders = ind.leaders; o.laggers = ind.laggers; o.indAvg = ind.avg;
  return o;
}
/* 复盘卡 HTML */
function reviewCardHtml(r){
  if(!r) return '';
  let h = '<div class="review-card"><div class="rc-date"> ' + r.date + ' ' + (r.at||'') + ' 生成</div>';
  const b = r.bench || {};
  const benchParts = [];
  ['上证','深成指','创业板','沪深300'].forEach(n => { if(b[n] != null) benchParts.push(n + ' <b>' + (b[n]>=0?'+':'') + b[n].toFixed(2) + '%</b>'); });
  h += '<div class="rc-row"><span class="rc-k">大盘</span><span class="rc-v">' + (benchParts.length ? benchParts.join(' · ') : '指数数据未加载') + '</span></div>';
  const hd = r.hold || {};
  h += '<div class="rc-row"><span class="rc-k">持仓</span><span class="rc-v">总市值 ' + fmt(hd.mv) + ' · 浮动盈亏 <b class="' + cls(hd.pl) + '">' + (hd.pl>=0?'+':'') + fmt(hd.pl) + ' (' + (hd.plp>=0?'+':'') + hd.plp.toFixed(2) + '%)</b> · 当日 ' + (hd.day>=0?'+':'') + fmt(hd.day) + ' · ' + hd.count + ' 笔</span></div>';
  if((r.holdRows || []).length){
    h += '<div class="rc-subrows">' + (r.holdRows || []).map(x => '<span class="rc-chip">' + x.name + ' ' + (x.pl>=0?'+':'') + fmt(x.pl) + ' (' + (x.plp>=0?'+':'') + x.plp.toFixed(1) + '%)</span>').join('') + '</div>';
  }
  const leadTxt = (r.leaders || []).map(x => x.name + ' ' + (x.day>=0?'+':'') + x.day.toFixed(2) + '%').join('、') || '数据未加载';
  const lagTxt = (r.laggers || []).map(x => x.name + ' ' + (x.day>=0?'+':'') + x.day.toFixed(2) + '%').join('、') || '数据未加载';
  h += '<div class="rc-row"><span class="rc-k">板块</span><span class="rc-v">领涨：' + leadTxt + ' ｜ 领跌：' + lagTxt + (r.indAvg!=null ? ' ｜ 行业平均 ' + (r.indAvg>=0?'+':'') + r.indAvg.toFixed(2) + '%' : '') + '</span></div>';
  h += '<div class="rc-note">纯事实描述 · 不构成投资建议</div></div>';
  return h;
}
/* 生成/取今日复盘（force=重新生成） */
function genTodayReview(force){
  const all = loadReviews(), today = todayStr();
  if(!force && all[today]) return all[today];
  const r = reviewCollect();
  all[today] = r; pruneReviews(all); saveReviews(all);
  return r;
}
/* 渲染复盘页：今日卡 + 历史列表 */
function renderReview(){
  const el = $('reviewBody'); if(!el) return;
  const all = loadReviews(), today = todayStr();
  const r = all[today] || genTodayReview(true);
  let h = '<div class="review-today">' + reviewCardHtml(r) + '</div>';
  const ks = Object.keys(all).sort().reverse().filter(k => k !== today);
  if(ks.length){
    h += '<div class="review-hist-h"> 历史复盘（近30天 · 点击展开）</div>';
    ks.forEach(k => {
      const old = all[k] || {};
      const pl = (old.hold && old.hold.pl != null) ? ((old.hold.pl>=0?'+':'') + fmt(old.hold.pl)) : '—';
      h += '<details class="review-item"><summary>' + k + ' · 持仓浮动盈亏 ' + pl + '</summary>' + reviewCardHtml(old) + '</details>';
    });
  }
  el.innerHTML = h;
}
/* 收盘后自动生成今日摘要（盘中不生成；已生成不重复） */
function tryAutoReview(){
  try{
    if(typeof isTradingNow === 'function' && isTradingNow()) return;
    if(loadReviews()[todayStr()]) return;
    genTodayReview(true);
    if(typeof state !== 'undefined' && state && state.view === 'review') renderReview();
  }catch(e){}
}
if(document.readyState === 'complete') setTimeout(tryAutoReview, 9000);
else window.addEventListener('load', function(){ setTimeout(tryAutoReview, 9000); });
