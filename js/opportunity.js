/* =========================================================================
 * opportunity.js
 * 模块：机会精选（主动权益基金·长期动量多因子扫描） / 季度轮动（分市况·样本外验证规律）
 * 数据源：东方财富基金排行移动端接口（JSONP，零 API Key，file:// 双击可用）
 * ========================================================================= */

/* ============ 机会精选（主动权益基金 · 长期动量多因子扫描 · 半年维度） ============ */
// 【为什么是基金不是行业ETF】原版扫 40 只行业ETF，2020-2026 真实样本外实测 RankIC = -0.116（显著为负，
//   即"综合分越高未来越跑输"）。A股行业层面存在强反转，动量类打分在行业维度是反向指标，该路径已被证伪并下线。
// 【现在这套的依据】1958 只主动权益基金、2022-12~2026-02 共 155 个滚动时点、持有 120 交易日（约半年）的真实
//   样本外 walk-forward 实测：综合分对未来半年收益 RankIC = +0.099 (t=4.34)，方向为正且显著。
// 【关键坑与解法】单纯取综合分 Top10 反而亏（极端头部＝刚暴涨完的基金，均值回归）。实测唯一稳健的取法是
//   "综合分 Top80 内，再按『近1年涨幅 − 近1月涨幅』(m250_20) 降序取 15 只"——即在整体强势里挑"长期强、
//   但最近一个月没疯涨"的，全段超额 +2.55%/期 (t=2.2)。
const OPP_CACHE = { rows: null, t: 0, picks: null, meta: null, sel: null };

// ---------- 数据源（JSONP，免 Referer、免 Key、file:// 可用） ----------
const OPP_RANK_URL = 'https://fundmobapi.eastmoney.com/FundMApi/FundRankNewList.ashx';
// 分层抓取：接口 pageSize 硬上限 30 条且无批量接口，只能按多个排序维度各翻若干页取头部
const OPP_PLAN = [['SYL_1N', 20], ['SYL_6Y', 10], ['SYL_3Y', 10]];
// 与回测口径一致：剔除被动指数/ETF联接类（回测池为主动权益）
const OPP_PASSIVE = /指数|ETF|联接|中证|沪深300|上证50|创业板指|科创50|标普|纳斯达克|恒生|MSCI|富时|国证|挂钩|LOF/;
const OPP_P = 80;    // 综合分前 P 名进入二次筛选（实测 P=40~150 均稳健，80 最优）
const OPP_N = 15;    // 最终精选只数
const OPP_MAXY = 200; // 近1年涨幅超过这个数的剔除（杠杆/分级/净值异常）
let _oppSeq = 0;

function _oppJsonp(sort, page, timeout) {
  return new Promise(resolve => {
    const cb = '__oppcb' + (_oppSeq++) + '_' + (Date.now() % 100000);
    let done = false;
    const s = document.createElement('script');
    const fin = v => { if (done) return; done = true; clearTimeout(tm); try { window[cb] = undefined; delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); resolve(v); };
    const tm = setTimeout(() => fin(null), timeout || 14000);
    window[cb] = d => fin(d);
    s.onerror = () => fin(null);
    s.src = OPP_RANK_URL + '?FundType=all&SortColumn=' + sort + '&Sort=desc&pageIndex=' + page +
      '&pageSize=30&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=1&callback=' + cb + '&_=' + Date.now();
    document.body.appendChild(s);
  });
}

// ---------- 数值工具（与回测脚本 fund_ic_test7.js 逐字同源） ----------
function _oppNum(v) { const x = parseFloat(v); return isNaN(x) ? null : x; }
function _oppMean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
// 标准平均秩（并列取平均）
function oppRank(arr) {
  const idx = arr.map((v, i) => i).filter(i => arr[i] != null && isFinite(arr[i]));
  idx.sort((a, b) => arr[a] - arr[b]);
  const out = new Array(arr.length).fill(null);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && arr[idx[j + 1]] === arr[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}
// 秩标准化到 [-1,1]，缺失记 0（中性）
function oppZrank(vals) {
  const r = oppRank(vals);
  const n = r.filter(x => x != null).length;
  if (n < 10) return vals.map(() => 0);
  return r.map(x => x == null ? 0 : (x - 1) / (n - 1) * 2 - 1);
}

// ---------- 因子（全部可由排行接口的"阶段涨幅"字段直接算出） ----------
// SYL_Z→近1周 / SYL_Y→近1月 / SYL_3Y→近3月 / SYL_6Y→近6月 / SYL_1N→近1年 / SYL_2N→近2年 / SYL_3N→近3年 / SYL_JN→今年来
const OPP_FACTORS = ['r250', 'r500', 'r750', 'r120', 'r60', 'm250_20', 'rYTD', 'r5', 'r20', 'accel', 'consist'];
// 四大类 + 方向（方向来自 155 个时点的 walk-forward 实测：长期动量恒正 / 中期动量84%正 / 短期反转81%负 / 形态88%负）
const OPP_GROUPS = {
  长期动量: { fs: ['r250', 'r500', 'r750'], dir: 1, why: '近1/2/3年涨得多的，未来半年继续占优（基金层面动量为正）' },
  中期动量: { fs: ['r120', 'r60', 'm250_20', 'rYTD'], dir: 1, why: '近半年/3月/今年来势头好的加分' },
  短期反转: { fs: ['r5', 'r20'], dir: -1, why: '最近1周/1月涨太猛的减分（短期均值回归）' },
  形态: { fs: ['accel', 'consist'], dir: -1, why: '短期加速度过高、三段全红的过热形态减分' }
};
const OPP_GNAMES = Object.keys(OPP_GROUPS);

function oppFactorsOf(d) {
  const p = v => { const x = _oppNum(v); return x == null ? null : x / 100; };
  const r5 = p(d.SYL_Z), r20 = p(d.SYL_Y), r60 = p(d.SYL_3Y), r120 = p(d.SYL_6Y);
  const r250 = p(d.SYL_1N), r500 = p(d.SYL_2N), r750 = p(d.SYL_3N), rYTD = p(d.SYL_JN);
  const m250_20 = (r250 != null && r20 != null) ? r250 - r20 : null;
  const accel = (r60 != null && r120 != null) ? r60 - r120 / 2 : null;
  let consist = null;
  if (r250 != null && r120 != null && r60 != null) consist = ((r250 > 0) + (r120 > 0) + (r60 > 0)) / 3;
  return { r5, r20, r60, r120, r250, r500, r750, rYTD, m250_20, accel, consist };
}

// ---------- 扫描主流程 ----------
async function scanOpportunities(onProgress) {
  const tasks = [];
  for (const pl of OPP_PLAN) for (let p = 1; p <= pl[1]; p++) tasks.push([pl[0], p]);
  const raw = [], seen = Object.create(null);
  let idx = 0, doneN = 0, okReq = 0;
  async function worker() {
    while (idx < tasks.length) {
      const t = tasks[idx++];
      const j = await _oppJsonp(t[0], t[1]);
      doneN++;
      if (onProgress) onProgress(doneN, tasks.length);
      if (j && j.Datas && j.Datas.length) {
        okReq++;
        for (const d of j.Datas) if (!seen[d.FCODE]) { seen[d.FCODE] = 1; raw.push(d); }
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  if (!raw.length) throw new Error('基金排行数据拉取失败（可能是网络或数据源变动），请稍后点「重新扫描」');

  // —— 清洗（严格对齐回测口径）——
  const stat = { raw: raw.length, req: tasks.length, okReq: okReq };
  let a = raw.filter(d => !OPP_PASSIVE.test(d.SHORTNAME || ''));
  stat.afterPassive = a.length;
  a = a.filter(d => _oppNum(d.DWJZ) != null && _oppNum(d.SYL_Z) != null && _oppNum(d.SYL_Y) != null &&
    _oppNum(d.SYL_3Y) != null && _oppNum(d.SYL_6Y) != null && _oppNum(d.SYL_1N) != null && _oppNum(d.SYL_JN) != null);
  stat.afterField = a.length;
  a = a.filter(d => _oppNum(d.SYL_1N) <= OPP_MAXY);
  stat.afterOutlier = a.length;
  // 同名基金份额去重（A/C/E/I/H 高度重复，优先留 A 类或无后缀）
  a.sort((x, y) => {
    const f = s => (/A$/.test(s) || !/[ABCEIHDR]$/.test(s)) ? 0 : 1;
    return f(x.SHORTNAME || '') - f(y.SHORTNAME || '');
  });
  const base = Object.create(null);
  a = a.filter(d => { const b = (d.SHORTNAME || '').replace(/[ABCEIHDR]$/, ''); if (base[b]) return false; base[b] = 1; return true; });
  stat.pool = a.length;
  if (a.length < 60) throw new Error('可用基金池只有 ' + a.length + ' 只（需≥60），数据源可能异常，请稍后重试');

  // —— 打分 —— 
  const rows = a.map(d => ({
    code: d.FCODE, name: d.SHORTNAME, type: OPP_TYPE_NAME[d.FUNDTYPE] || '权益类',
    nav: _oppNum(d.DWJZ), date: d.FSRQ, buy: d.BUY === true, f: oppFactorsOf(d)
  }));
  const Z = {};
  for (const f of OPP_FACTORS) Z[f] = oppZrank(rows.map(r => r.f[f]));
  rows.forEach((r, i) => {
    r.g = {}; let s = 0;
    for (const g of OPP_GNAMES) {
      const G = OPP_GROUPS[g];
      let sum = 0, n = 0;
      for (const f of G.fs) { const z = Z[f][i]; if (z != null && isFinite(z)) { sum += z; n++; } }
      const gv = n ? sum / n : 0;
      r.g[g] = gv;
      s += G.dir * gv;
    }
    r.comp = s / OPP_GNAMES.length;             // -1 ~ 1
    r.score = Math.round((r.comp + 1) / 2 * 100); // 0 ~ 100 展示分
  });
  rows.sort((x, y) => y.comp - x.comp);
  rows.forEach((r, i) => { r.rk = i + 1; });

  // —— 精选：综合分 Top P → 按 m250_20 降序取 N ——
  const head = rows.slice(0, Math.min(OPP_P, rows.length)).filter(r => r.f.m250_20 != null);
  head.sort((x, y) => y.f.m250_20 - x.f.m250_20);
  const picks = head.slice(0, OPP_N);
  picks.forEach((r, i) => { r.pick = i + 1; });

  stat.date = rows.length ? rows[0].date : '';
  OPP_CACHE.rows = rows; OPP_CACHE.picks = picks; OPP_CACHE.meta = stat; OPP_CACHE.t = Date.now();
  return rows;
}
const OPP_TYPE_NAME = { '001': '股票型', '002': '混合型', '003': '债券型', '005': 'QDII', '007': '股票型', '006': 'FOF' };

// ---------- 文案 ----------
function oppPct(v, dg) { return v == null ? '--' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(dg == null ? 1 : dg) + '%'); }
function oppCol(v) { return v == null ? '#8a93a3' : (v >= 0 ? 'var(--up)' : 'var(--down)'); }
function oppPickLabel(i) { return i <= 5 ? '★ 精选' : '精选'; }
function oppScoreCls(s) { return s >= 72 ? 'opp-strong' : s >= 58 ? 'opp-attn' : s >= 42 ? 'opp-watch' : 'opp-caut'; }
function oppScoreLabel(s) { return s >= 72 ? '强势' : s >= 58 ? '偏强' : s >= 42 ? '中性' : '偏弱'; }

// 一句话理由：说清"为什么它进精选"
function oppReasonPick(r) {
  const bits = [];
  if (r.f.r250 != null) bits.push('近1年 <b style="color:' + oppCol(r.f.r250) + '">' + oppPct(r.f.r250) + '</b>');
  if (r.f.r120 != null) bits.push('近半年 <b style="color:' + oppCol(r.f.r120) + '">' + oppPct(r.f.r120) + '</b>');
  if (r.f.r20 != null) bits.push('近1月 <b style="color:' + oppCol(r.f.r20) + '">' + oppPct(r.f.r20) + '</b>');
  let tail = '';
  if (r.f.r20 != null && r.f.r250 != null) {
    tail = r.f.r20 <= 0
      ? '；长期强势但<b>最近一个月在回调</b>，正是这套规律偏好的形态'
      : (r.f.r20 < 0.05 ? '；长期强势且<b>近一个月涨得不猛</b>，没有过热' : '；注意近一个月已有明显上涨，短期偏热');
  }
  return bits.join(' · ') + tail;
}
function oppReasonRow(r) {
  const g = r.g || {};
  const strong = OPP_GNAMES.filter(n => (OPP_GROUPS[n].dir * (g[n] || 0)) > 0.25);
  const weak = OPP_GNAMES.filter(n => (OPP_GROUPS[n].dir * (g[n] || 0)) < -0.25);
  const p = [];
  if (strong.length) p.push('<span style="color:var(--up)">' + strong.join('、') + ' 加分</span>');
  if (weak.length) p.push('<span style="color:var(--down)">' + weak.join('、') + ' 减分</span>');
  if (!p.length) p.push('各维度中性');
  return p.join('；');
}

// ---------- 渲染 ----------
function renderOpportunities() {
  const box = $('oppList'); if (!box) return;
  if (OPP_CACHE.rows && Date.now() - OPP_CACHE.t < 10 * 60 * 1000) { _renderOppList(); renderBacktest(); return; }
  box.innerHTML = '<div class="empty">正在扫描全市场主动权益基金…<br><span id="oppProg" class="meta">0 / ' + OPP_PLAN.reduce((s, x) => s + x[1], 0) + '</span></div>';
  renderBacktest();
  scanOpportunities((a, b) => { const p = $('oppProg'); if (p) p.textContent = a + ' / ' + b; })
    .then(() => { _renderOppList(); renderBacktest(); })
    .catch(e => { box.innerHTML = '<div class="empty">扫描失败：' + (e && e.message ? e.message : e) + '</div>'; });
}

function _renderOppList() {
  const box = $('oppList'); if (!box) return;
  const rows = OPP_CACHE.rows, picks = OPP_CACHE.picks, meta = OPP_CACHE.meta;
  if (!rows || !rows.length) { box.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  const mode = ($('oppSort') && $('oppSort').value) || 'pick';
  let list, isPick = false;
  if (mode === 'pick') { list = picks; isPick = true; }
  else if (mode === 'comp') list = rows.slice(0, 60);
  else if (mode === 'y1') list = rows.slice().sort((a, b) => (b.f.r250 == null ? -9 : b.f.r250) - (a.f.r250 == null ? -9 : a.f.r250)).slice(0, 60);
  else if (mode === 'h6') list = rows.slice().sort((a, b) => (b.f.r120 == null ? -9 : b.f.r120) - (a.f.r120 == null ? -9 : a.f.r120)).slice(0, 60);
  else if (mode === 'cool') list = rows.slice(0, OPP_P).slice().sort((a, b) => (a.f.r20 == null ? 9 : a.f.r20) - (b.f.r20 == null ? 9 : b.f.r20)).slice(0, 30);
  else list = picks;

  const tm = $('oppTime');
  if (tm && meta) tm.textContent = '净值 ' + (meta.date || '--') + ' · 池 ' + meta.pool + ' 只 · ' + new Date(OPP_CACHE.t).toTimeString().slice(0, 5) + ' 扫描';

  const head = isPick
    ? '<div class="opp-pickhead">🎯 <b>本期精选 ' + list.length + ' 只</b>：从 ' + rows.length + ' 只主动权益基金里，先按四维综合分取前 ' + OPP_P +
    ' 名，再从中挑「长期强势但最近一个月没疯涨」的前 ' + OPP_N + ' 只。<b>持有周期按半年设计</b>，不是短线。</div>'
    : '';

  box.innerHTML = head + list.map((r, i) => {
    const rank = isPick ? (i + 1) : r.rk;
    const tag = isPick ? oppPickLabel(i + 1) : oppScoreLabel(r.score);
    const cls = isPick ? (i < 5 ? 'opp-strong' : 'opp-attn') : oppScoreCls(r.score);
    return '<div class="opp-row' + (OPP_CACHE.sel === r.code ? ' on' : '') + '" data-code="' + r.code + '">' +
      '<div class="opp-rank">' + rank + '</div>' +
      '<div><div class="opp-name">' + r.name + '</div>' +
      '<div class="opp-etf">' + r.code + ' · ' + r.type + (r.buy ? '' : ' · <span style="color:var(--down)">暂停申购</span>') + '</div>' +
      '<div class="opp-reason">' + (isPick ? oppReasonPick(r) : oppReasonRow(r)) + '</div>' +
      '<div class="opp-pred">1年 <b style="color:' + oppCol(r.f.r250) + '">' + oppPct(r.f.r250) + '</b>' +
      ' · 半年 <b style="color:' + oppCol(r.f.r120) + '">' + oppPct(r.f.r120) + '</b>' +
      ' · 1月 <b style="color:' + oppCol(r.f.r20) + '">' + oppPct(r.f.r20) + '</b></div></div>' +
      '<div><div class="opp-score" style="color:' + (r.score >= 58 ? 'var(--up)' : '#3a6ea5') + '">' + r.score + '</div>' +
      '<div class="opp-tag ' + cls + '">' + tag + '</div></div>' +
      '</div>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('.opp-row'), el => {
    el.onclick = () => selectOpp(el.getAttribute('data-code'));
  });
}

// ---------- 策略验证面板（写真实回测数字，含反面结论与风险） ----------
function renderBacktest() {
  const box = $('btBody'); if (!box) return;
  box.innerHTML =
    '<p class="bt-note" style="border:1px solid #e3edf7;background:#f3f8fd;color:#26527a;padding:8px 10px;border-radius:8px;line-height:1.6;">' +
    '📐 <b>这套规律是怎么验出来的</b>：取 <b>1958 只主动权益基金</b>近 6 年真实累计净值，从 2022-12 到 2026-02 每 5 个交易日切一个时点（共 <b>155 个时点</b>），' +
    '每个时点只用<b>当时能看到的数据</b>打分，再看之后 <b>120 个交易日（约半年）</b>的真实收益——即滚动样本外检验（walk-forward），不是拿历史结果倒推。</p>' +

    '<table class="bt-table"><thead><tr><th>检验项</th><th>结果</th><th>怎么读</th></tr></thead><tbody>' +
    '<tr><td>综合分 vs 未来半年收益 RankIC</td><td style="color:var(--up);font-weight:700;">+0.099 (t=4.34)</td><td>正且显著：分高的确实更容易跑赢</td></tr>' +
    '<tr><td>单因子最强：近1年涨幅 − 近1月涨幅</td><td style="color:var(--up);font-weight:700;">+0.139 (t=6.48)</td><td>155 期里 77% 的时点方向正确</td></tr>' +
    '<tr><td><b>本策略（Top' + OPP_P + '→取' + OPP_N + '）超额</b></td><td style="color:var(--up);font-weight:700;">+2.55% / 半年 (t=2.2)</td><td>相对同批候选基金平均多赚的部分</td></tr>' +
    '<tr><td>参数稳健性 P=40~150 / N=10~20</td><td style="color:var(--up);">全部为正</td><td>换个参数结论不翻车，不是碰巧调出来的</td></tr>' +
    '<tr><td>后半段（2024-07~2026-02）</td><td style="color:var(--up);font-weight:700;">+3.82% (t=1.80)</td><td>近两年有效</td></tr>' +
    '<tr><td>前半段（2022-12~2024-06）</td><td style="color:#e08a00;font-weight:700;">+0.52% (t=0.76)</td><td>⚠️ 几乎无效，只是没亏</td></tr>' +
    '</tbody></table>' +

    '<p class="bt-note" style="border:1px solid #f6d6d6;background:#fdf3f3;color:#a4342f;padding:8px 10px;border-radius:8px;margin-top:8px;line-height:1.6;">' +
    '⚠️ <b>必须知道的四个短板（不藏着）</b><br>' +
    '① <b>年份很不均匀</b>：2023 +0.62%、<b>2024 −0.95%（亏的）</b>、2025 +3.79%、2026 前两月 +32%。收益高度集中在牛市段，' +
    '横盘年基本白干。<br>' +
    '② <b>不是稳赢，是赌右尾</b>：策略半年正收益比例 59%，反而略低于候选池平均的 62%；靠的是赢的时候赢很多。' +
    '最差单期策略 <b>−23.6%</b>，同期候选池 −15.6%，<b>波动比平均更大</b>。<br>' +
    '③ <b>幸存者偏差</b>：基金池取自当前还活着的名单，已清盘的拿不到，这会系统性<b>高估</b>动量策略的成绩，真实效果应打折。<br>' +
    '④ <b>候选池不是全市场</b>：接口每页只给 30 条，只能按涨幅榜翻页取头部约 ' + (OPP_CACHE.meta ? OPP_CACHE.meta.pool : 360) +
    ' 只，天然偏向已经涨过的基金。</p>' +

    '<p class="bt-note" style="border:1px solid #e6eaf1;background:#fafbfd;color:#5a6472;padding:8px 10px;border-radius:8px;margin-top:8px;line-height:1.6;">' +
    '🧪 <b>顺便说个反面结论</b>：本模块上一版扫的是 40 只行业ETF，用同样的真实样本外方法测出 RankIC = <b style="color:var(--down)">−0.116</b>' +
    '（显著为负，等于反向推荐）。所以那一版<b>已经下线</b>，改成了现在这套基金版。' +
    '这里写出来是想说明：<b>面板上的数字都是真跑出来的，包括不好看的。</b></p>' +

    '<p class="bt-note">📚 方法出处：Jegadeesh & Titman (1993) 动量效应；Carhart (1997) 基金业绩持续性；' +
    'Fama-MacBeth 横截面回归 + RankIC 检验。<b>本模块只做历史统计描述，不构成任何投资建议。</b></p>';
}

// ---------- 详情 ----------
function selectOpp(code) {
  OPP_CACHE.sel = code;
  _renderOppList();
  const r = (OPP_CACHE.rows || []).filter(x => x.code === code)[0];
  if (!r) return;
  const emp = $('oppEmpty'), dt = $('oppDetail');
  if (emp) emp.style.display = 'none';
  if (dt) dt.style.display = '';
  renderOppDetail(r);
  // 净值曲线：复用基金净值模块（东财 pingzhongdata）
  if (typeof loadFund === 'function') {
    const fd = state.fundData && state.fundData[code];
    if (fd && fd.nav && fd.nav.length) { try { drawNav('oppKline', fd); } catch (e) { } }
    else {
      const cv = $('oppKline');
      if (cv) { const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#8a93a3'; c.font = '13px sans-serif'; c.fillText('正在加载净值曲线…', 12, 22); }
      loadFund(code, true);
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        const f2 = state.fundData && state.fundData[code];
        if (f2 && f2.nav && f2.nav.length) { clearInterval(iv); if (OPP_CACHE.sel === code) { try { drawNav('oppKline', f2); } catch (e) { } } }
        else if (tries > 40) {
          clearInterval(iv);
          const cv2 = $('oppKline');
          if (cv2 && OPP_CACHE.sel === code) { const c2 = cv2.getContext('2d'); c2.clearRect(0, 0, cv2.width, cv2.height); c2.fillStyle = '#8a93a3'; c2.font = '13px sans-serif'; c2.fillText('净值曲线加载失败（不影响上方评分）', 12, 22); }
        }
      }, 250);
    }
  }
}

function renderOppDetail(r) {
  const nm = $('oppDName'); if (nm) nm.textContent = r.name;
  const pr = $('oppDPrice'); if (pr) pr.textContent = r.nav == null ? '--' : r.nav.toFixed(4);
  const cg = $('oppDChg');
  if (cg) { cg.textContent = '近1月 ' + oppPct(r.f.r20); cg.style.color = oppCol(r.f.r20); }
  const mt = $('oppDMeta');
  if (mt) mt.textContent = r.code + ' · ' + r.type + ' · 净值日 ' + (r.date || '--') + ' · 综合分排名 ' + r.rk + '/' + (OPP_CACHE.rows ? OPP_CACHE.rows.length : '--') + (r.pick ? ' · 本期精选第 ' + r.pick + ' 位' : '');

  const box = $('oppCards'); if (!box) return;
  const c = [];
  c.push(_oppCard('综合分', String(r.score), '越高＝四维打分越强', r.score >= 58 ? '#e01f22' : '#3a6ea5'));
  c.push(_oppCard('近1年', oppPct(r.f.r250), '长期动量主力因子', oppCol(r.f.r250)));
  c.push(_oppCard('近半年', oppPct(r.f.r120), '中期动量', oppCol(r.f.r120)));
  c.push(_oppCard('近3月', oppPct(r.f.r60), '中期动量', oppCol(r.f.r60)));
  c.push(_oppCard('近1月', oppPct(r.f.r20), '越低越好（短期反转）', oppCol(r.f.r20)));
  c.push(_oppCard('近1周', oppPct(r.f.r5), '越低越好（短期反转）', oppCol(r.f.r5)));
  c.push(_oppCard('今年来', oppPct(r.f.rYTD), '年内累计', oppCol(r.f.rYTD)));
  c.push(_oppCard('1年−1月', oppPct(r.f.m250_20), '★最强单因子 IC+0.139', oppCol(r.f.m250_20)));
  if (r.f.r500 != null) c.push(_oppCard('近2年', oppPct(r.f.r500), '长期动量', oppCol(r.f.r500)));
  if (r.f.r750 != null) c.push(_oppCard('近3年', oppPct(r.f.r750), '长期动量', oppCol(r.f.r750)));
  // 四大类得分
  for (const g of OPP_GNAMES) {
    const G = OPP_GROUPS[g], v = (r.g && r.g[g] != null) ? r.g[g] : 0, eff = G.dir * v;
    c.push(_oppCard(g + (G.dir > 0 ? ' ↑' : ' ↓'), (eff >= 0 ? '+' : '') + eff.toFixed(2),
      eff >= 0 ? '本项加分' : '本项减分', eff >= 0 ? '#e01f22' : '#1aa260'));
  }
  box.innerHTML = c.join('');

  const hint = $('oppDetailHint');
  if (hint) {
    hint.innerHTML = '📘 <b>怎么读</b>：综合分 = 四大类（' + OPP_GNAMES.join('、') + '）各自在池内排名后<b>等权</b>合成，' +
      '方向由 155 个时点的真实样本外检验决定（长期/中期动量为正、短期涨太猛为负）。' +
      '<b>「1年−1月」是本策略的核心指标</b>——长期涨得多、但最近一个月没跟着疯涨的，历史上未来半年表现最好。' +
      '<b style="color:#a4342f">本页只描述历史统计，不预测涨跌、不构成投资建议；基金有风险，且策略在 2024 年是负超额。</b>';
  }
}
function _oppCard(lbl, val, sub, color) { return '<div class="opp-card"><div class="oc-lbl">' + lbl + '</div><div class="oc-val" style="color:' + color + ';">' + val + '</div><div class="oc-sub">' + sub + '</div></div>'; }

$('oppSort') && ($('oppSort').onchange = () => { if (OPP_CACHE.rows) _renderOppList(); });
$('oppRescan') && ($('oppRescan').onclick = () => { OPP_CACHE.rows = null; OPP_CACHE.t = 0; OPP_CACHE.sel = null; renderOpportunities(); });
// 「在行情看板查看」：行情看板靠自选列表判断标的类型，故不在自选时先自动加入再跳转
$('oppToMarket') && ($('oppToMarket').onclick = () => {
  const code = OPP_CACHE.sel; if (!code) return;
  if (typeof state !== 'undefined' && state.watch && !state.watch.some(x => x.code === code)) {
    state.watch.push({ code: code, kind: 'fund', cat: ((state.watchCat && state.watchCat !== 'all') ? state.watchCat : 'def') });
    if (typeof save === 'function') save();
    if (typeof renderWatch === 'function') renderWatch();
  }
  if (typeof selectCode === 'function') selectCode(code);
  if (typeof showView === 'function') showView('market');
});

/* ============ 行业温度计（纯描述 · 不预测 · 不构成推荐） ============
 * 【为什么从「季度轮动」降级成「温度计」】
 * 原模块声称两条经样本外验证的规律：牛市→低波动占优 / 熊市→动量反转超跌反弹，
 * 并宣传「季度轮动超额 +45pp、最大回撤仅 0.8%」。
 * 2026-08-11 用 40 只行业ETF 真实日K（2020-06~2026-08，1500 交易日，已对 13 处 ETF 份额折算
 * 做后复权，见 sectors.js/adjustSplits）重跑 walk-forward（每 10 交易日一时点，取规则前 25%，
 * 减全池均值），三个持有期结果：
 *   牛市低波占优：60日 -0.05%(t-0.06) / 120日 -0.23%(t-0.18) / 250日 -0.96%(t-0.38)
 *   熊市超跌反弹：60日 -0.04%(t-0.09) / 120日 -2.12%(t-2.64 显著为负) / 250日 -1.07%(t-0.49)
 * 六个口径全为负、无一显著为正 → 原 +45pp 宣传不成立，去掉全部推荐语义。
 * 唯一方向一致、2/3 口径显著的发现（且是「避坑」不是「买入」）：
 *   牛市里年化波动最高的 25% 行业，相对全池超额 -1.18%(t-1.47,60日) / -2.00%(t-2.87,120日)
 *   / -3.07%(t-2.06,250日) → 本页保留为「高波警示区」，仅提示风险。
 * 另：同一 40 只 ETF 的旧「综合分」真实样本外 IC = -0.116(t-2.78)，是反向的，已下线。
 * 验证脚本：verify_rotation.js
 */
const THERMO = { rows: null, regime: null, bench60: null, pos1y: null, sort: 'c20' };

async function renderRotation() {   // 函数名保留，供 app.js 既有接线调用
  const box = $('rotationBody'); if (!box) return;
  const POOL = INDUSTRY_POOL.concat(loadCustomSectors());
  box.innerHTML = '<div class="empty">正在读取 ' + POOL.length + ' 个行业的冷热数据（约数秒）…</div>';
  const bn = $('rotationBanner'); if (bn) bn.innerHTML = '';

  // 当日涨跌：腾讯批量行情（零Key、CORS 友好）
  let quotes = {};
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => { try { ctrl.abort(); } catch (_) { } }, 8000);
    const qtCodes = POOL.map(x => normCode(x.code));
    const r = await fetch('https://qt.gtimg.cn/q=' + qtCodes.join(',') + '&_=' + Date.now(), { signal: ctrl.signal });
    clearTimeout(to);
    const buf = await r.arrayBuffer();
    quotes = parseTencent(new TextDecoder('gb18030').decode(buf));
  } catch (e) { console.warn('thermo quotes failed', e); }

  // 基准：沪深300 日K（腾讯前复权，零Key）
  let bench5 = null, bench20 = null, bench60 = null, bk = null, pos1y = null;
  try {
    bk = await loadKlineP('sh000300', 'd');
    if(!(bk && bk.length)) bk = await fetchEMKline('1.000300');   // 沪深300沪市，腾讯挂时东财兜底
    if(!(bk && bk.length)) bk = await loadSinaKlineP('sh000300');   // 东财也挂 → 新浪兜底
    bench5 = klinePct(bk, 5); bench20 = klinePct(bk, 20); bench60 = klinePct(bk, 60);
    if (bk && bk.length >= 60) {
      const c250 = bk.slice(-250).map(x => x.close);
      const lo = Math.min(...c250), hi = Math.max(...c250), cur = c250[c250.length - 1];
      pos1y = hi > lo ? (cur - lo) / (hi - lo) * 100 : 50;
    }
  } catch (e) { console.warn('thermo bench failed', e); }

  const rows = await Promise.all(POOL.map(async x => {
    let kl = await loadKlineP(x.code, 'd');
    if(!(kl && kl.length)) kl = await loadEMKline(x.code);   // 腾讯fqkline被WAF/限流连不上 → 东财兜底
    if(!(kl && kl.length)) kl = await loadSinaKlineP(x.code);   // 东财也挂 → 新浪兜底
    const q = quotes[normCode(x.code)] || {};
    const ind = computeSectorIndicators(kl);
    return {
      name: x.name, code: x.code, etf: x.etf,
      day: (q.changePct == null ? null : q.changePct),
      c5: klinePct(kl, 5), c20: klinePct(kl, 20), c60: klinePct(kl, 60),
      volAnn: (ind && ind.vol) ? ind.vol.ann : null,
      klMiss: !kl
    };
  }));

  const demoFails = rows.filter(r => r.klMiss).map(r => r.name);
  let demoWarn = '';
  if (demoFails.length) {
    const head = demoFails.slice(0, 8).join('、') + (demoFails.length > 8 ? ' 等' : '');
    demoWarn = '<div class="demo-warn">⚠️ 行情接口连不上：' + demoFails.length + ' 个行业（' + head + '）无法获取真实K线，<b>已隐藏其假数据</b>，表中标灰行为「连不上」。当日% 若正常显示则为真实行情，<b>请勿参考其趋势列</b>。请检查网络后点「重新读取」。</div>';
  }

  THERMO.rows = rows;   // 保留全部行（含连不上的 klMiss），渲染时标灰显示「连不上」，便于看出哪些行业掉线
  THERMO.regime = (bench60 == null) ? 'unknown' : (bench60 > 5 ? 'bull' : (bench60 < -5 ? 'bear' : 'flat'));
  THERMO.bench = { b5: bench5, b20: bench20, b60: bench60 };
  THERMO.pos1y = pos1y;
  THERMO.demoWarn = demoWarn;
  _renderThermo();
  const tt = $('rotationTime'); if (tt) tt.textContent = '更新 ' + ts();
}

/* 市场温度条：纯描述，不给方向 */
function _thermoBanner() {
  const b = THERMO.bench || {}, rg = THERMO.regime;
  const RG = { bull: ['🟢', '偏强', 'bull'], bear: ['🔴', '偏弱', 'bear'], flat: ['🟡', '震荡', 'flat'], unknown: ['⚪', '未知', 'flat'] }[rg] || ['⚪', '未知', 'flat'];
  const f = v => v == null ? '--' : '<b class="' + (v >= 0 ? 'up' : 'down') + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</b>';
  let posTxt = '';
  if (THERMO.pos1y != null) {
    const p = THERMO.pos1y;
    posTxt = '　·　当前点位在近1年价格区间的 <b>' + p.toFixed(0) + '%</b> 位置（' + (p < 30 ? '偏低' : (p > 70 ? '偏高' : '中间')) + '）';
  }
  return '<div class="regime-banner ' + RG[2] + '">' + RG[0] + ' <b>大盘温度：' + RG[1] + '</b>　沪深300 近5日 ' + f(b.b5) + '　近20日 ' + f(b.b20) + '　近60日 ' + f(b.b60) + posTxt + '</div>'
    + '<div class="explain" style="margin-top:8px;">上面只是<b>当前状态的描述</b>（大盘最近强还是弱、贵还是便宜），不是预测。下面这张表把各行业按冷热排个队，同样只是<b>陈述已经发生的涨跌</b>。</div>';
}

/* 冷热色带：按相对全池的分位上色（纯排名，不是评分） */
function _heatCls(v, all) {
  if (v == null) return '';
  const arr = all.filter(x => x != null).sort((a, b) => a - b);
  if (arr.length < 4) return '';
  const r = arr.filter(x => x < v).length / arr.length;
  if (r >= 0.8) return 'heat-hot';
  if (r >= 0.6) return 'heat-warm';
  if (r <= 0.2) return 'heat-cold';
  if (r <= 0.4) return 'heat-cool';
  return 'heat-mid';
}
function _pf(v) { return v == null ? '--' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

function _renderThermo() {
  const box = $('rotationBody'); if (!box) return;
  const rows = THERMO.rows || [];
  if (!rows.length) { box.innerHTML = '<div class="empty">未取到行业数据，请点「重新读取」重试。</div>'; return; }
  const key = THERMO.sort;
  const sorted = rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null) return 1; if (bv == null) return -1;
    return key === 'volAnn' ? bv - av : bv - av;   // 一律从高到低
  });

  const all5 = rows.map(r => r.c5), all20 = rows.map(r => r.c20), all60 = rows.map(r => r.c60);
  // 牛市高波警示区：唯一三口径一致显著的实证结论（避坑，不是买入建议）
  let warnSet = {};
  if (THERMO.regime === 'bull') {
    const va = rows.filter(r => r.volAnn != null).sort((a, b) => b.volAnn - a.volAnn);
    const k = Math.max(1, Math.floor(va.length * 0.25));
    va.slice(0, k).forEach(r => warnSet[r.code] = 1);
  }

  const head = '<thead><tr><th>#</th><th>行业</th><th>代表ETF</th><th>当日</th>'
    + '<th class="' + (key === 'c5' ? 'th-on' : '') + '">近5日</th>'
    + '<th class="' + (key === 'c20' ? 'th-on' : '') + '">近20日</th>'
    + '<th class="' + (key === 'c60' ? 'th-on' : '') + '">近60日</th>'
    + '<th class="' + (key === 'volAnn' ? 'th-on' : '') + '">年化波动</th>'
    + '<th>冷热</th></tr></thead>';

  const body = sorted.map((r, i) => {
    const miss = r.klMiss;
    const hot = miss ? '' : _heatCls(r.c20, all20);
    const label = miss ? '连不上' : ({ 'heat-hot': '🔥 很热', 'heat-warm': '🌤 偏热', 'heat-mid': '⬜ 一般', 'heat-cool': '🌥 偏冷', 'heat-cold': '❄️ 很冷' }[hot] || '--');
    const warn = (!miss && warnSet[r.code]) ? ' <span class="thermo-warn" title="牛市中波动最高的25%行业，实测显著跑输，属风险提示">⚠ 高波</span>' : '';
    return '<tr data-code="' + r.code + '"' + (miss ? ' class="row-miss"' : '') + '><td><span class="rank">' + (i + 1) + '</span></td>'
      + '<td>' + r.name + warn + '</td>'
      + '<td>' + r.etf + ' <span class="cd" style="font-size:11px;color:var(--sub);">' + r.code + '</span></td>'
      + '<td class="' + (r.day == null ? '' : (r.day >= 0 ? 'up' : 'down')) + '">' + _pf(r.day) + '</td>'
      + '<td class="' + (r.c5 == null ? '' : (r.c5 >= 0 ? 'up' : 'down')) + '">' + _pf(r.c5) + '</td>'
      + '<td class="' + (r.c20 == null ? '' : (r.c20 >= 0 ? 'up' : 'down')) + '">' + _pf(r.c20) + '</td>'
      + '<td class="' + (r.c60 == null ? '' : (r.c60 >= 0 ? 'up' : 'down')) + '">' + _pf(r.c60) + '</td>'
      + '<td>' + (r.volAnn == null ? '--' : r.volAnn.toFixed(1) + '%') + '</td>'
      + '<td><span class="heat-pill ' + hot + '">' + label + '</span></td></tr>';
  }).join('');

  let warnBlk = '';
  if (THERMO.regime === 'bull' && Object.keys(warnSet).length) {
    warnBlk = '<div class="rot-note" style="border-left:3px solid var(--down);margin-top:12px;">'
      + '<b>⚠ 高波警示区（唯一还算站得住的结论，而且是「别追」不是「该买」）</b><br>'
      + '真实回测（已做份额折算复权）：大盘偏强时，年化波动最高的 25% 行业相对全池平均<b class="down"> 跑输 1.2%~3.1%</b>（持有3个月/6个月/1年 t 值 −1.47 / −2.87 / −2.06，方向一致、2 个口径显著）。'
      + '上表中已标 <span class="thermo-warn">⚠ 高波</span> 的行业属于这一档，<b>只作风险提示</b>：追高波动品种在强市里长期是吃亏的。这不代表其它行业就该买。</div>';
  }

  const foot = '<div class="rot-note" style="margin-top:12px;">'
    + '📌 <b>这张表只回答一件事：哪些行业最近热、哪些最近冷。</b>它<b>不排名"该买哪个"</b>，也不预测下一步。点行可加入自选、跳到行情看板看细节。<br>'
    + '<span style="color:var(--sub);">冷热档位按各行业近20日涨幅在全池中的相对位置划分（前20%=很热，后20%=很冷），是排名不是评分。</span></div>';

  box.innerHTML = '<div class="rot-cands"><div class="rot-h">🌡️ 全部 ' + rows.length + ' 个行业冷热排队 <span style="color:var(--sub);font-weight:400;">（当前按' + ({ c5: '近5日', c20: '近20日', c60: '近60日', volAnn: '年化波动' }[key]) + '从高到低）</span></div>'
    + '<table class="sectors">' + head + '<tbody>' + body + '</tbody></table>' + warnBlk + foot + '</div>';

  const bn = $('rotationBanner'); if (bn) bn.innerHTML = (THERMO.demoWarn || '') + _thermoBanner();

  box.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = () => {
    const code = normCode(tr.dataset.code) || tr.dataset.code;
    if (typeof state !== 'undefined' && state.watch && !state.watch.some(w => w.code === code)) {
      state.watch.push({ code: code, kind: 'stock', name: '' });
      if (typeof save === 'function') save();
      if (typeof renderWatch === 'function') renderWatch();
    }
    if (typeof selectCode === 'function') selectCode(code);
    document.querySelectorAll('.navitem').forEach(n => n.classList.toggle('on', n.dataset.view === 'market'));
    if (typeof showView === 'function') showView('market');
  });
}

$('thermoSort') && ($('thermoSort').onchange = (e) => { THERMO.sort = e.target.value; if (THERMO.rows) _renderThermo(); });
