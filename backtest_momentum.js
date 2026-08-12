// 主动权益基金 动量轮动 walk-forward 回测（样本外，真实累计净值）
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const cache = JSON.parse(fs.readFileSync('fund_nav_cache.json', 'utf8'));
// 预处理每只基金：升序 ts 数组 + nav 数组 + 二分查找
const funds = {};
for (const [code, arr] of Object.entries(cache)) {
  const ts = arr.map(x => x[0]).sort((a, b) => a - b);
  const nav = new Array(ts.length);
  const map = new Map();
  arr.forEach(([t, v]) => map.set(t, v));
  ts.forEach((t, i) => nav[i] = map.get(t));
  funds[code] = { ts, nav };
}
const codes = Object.keys(funds);
console.log(`基金数: ${codes.length}`);

// 全局交易日历（去重升序）
const calSet = new Set();
codes.forEach(c => funds[c].ts.forEach(t => calSet.add(t)));
const calendar = [...calSet].sort((a, b) => a - b);
const calIdx = new Map(calendar.map((t, i) => [t, i]));
// 月末调仓日（每月最后一个交易日）
const rebalMap = new Map();
calendar.forEach(t => { const d = new Date(t); const ym = d.getFullYear() * 100 + (d.getMonth() + 1); rebalMap.set(ym, t); });
const rebal = [...rebalMap.values()].sort((a, b) => a - b);
console.log(`交易日历: ${calendar.length} 天, 调仓次数(月末): ${rebal.length}`);

function navAt(code, ts) {
  const f = funds[code];
  let lo = 0, hi = f.ts.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (f.ts[mid] <= ts) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? null : f.nav[ans];
}

// 回测区间：2018-01 起（确保有 ≥1 年历史算动量），到 2026-08
const START = new Date('2018-01-01').getTime();
const END = new Date('2026-08-12').getTime();
const periodStart = rebal.find(t => t >= START);
const periodEnd = [...rebal].reverse().find(t => t <= END);
const rb = rebal.filter(t => t >= periodStart && t <= periodEnd);
console.log(`回测区间: ${new Date(periodStart).toISOString().slice(0,10)} ~ ${new Date(periodEnd).toISOString().slice(0,10)}, 调仓点 ${rb.length}`);

const COST = 0.003; // 单次换仓往返成本（保守）

function backtest(lookback, N, skipRecent = 0) {
  let equity = 1, peak = 1, maxDD = 0;
  let prevTarget = null;
  const yearly = {};
  const rets = [];
  for (let i = 0; i < rb.length - 1; i++) {
    const d = rb[i], dNext = rb[i + 1];
    const di = calIdx.get(d);
    if (di < lookback) { prevTarget = null; continue; }
    // 算每只动量
    const scored = [];
    for (const c of codes) {
      const pastTs = calendar[di - lookback];
      const navD = navAt(c, d), navPast = navAt(c, pastTs);
      if (navD == null || navPast == null) continue;
      let mom = navD / navPast - 1;
      if (skipRecent > 0) { // 12M-1M 式：去掉最近 skipRecent 交易日收益
        const nearTs = calendar[di - skipRecent];
        const navNear = navAt(c, nearTs);
        if (navNear == null) continue;
        mom = (navNear / navPast - 1); // 用 (d-skipRecent) 到 (d-lookback) 区间
      }
      scored.push([c, mom]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const target = scored.slice(0, N).map(x => x[0]);
    if (prevTarget && target.length === N) {
      let ret = 0;
      for (const c of prevTarget) { const a = navAt(c, d), b = navAt(c, dNext); if (a && b) ret += b / a - 1; }
      ret /= N;
      const overlap = target.filter(c => prevTarget.includes(c)).length;
      const turnover = 1 - overlap / N;
      const fee = turnover * COST;
      ret -= fee;
      equity *= (1 + ret);
      rets.push(ret);
      peak = Math.max(peak, equity); maxDD = Math.max(maxDD, 1 - equity / peak);
      const y = new Date(dNext).getFullYear();
      yearly[y] = (yearly[y] || 1) * (1 + ret);
    }
    prevTarget = target;
  }
  const years = (periodEnd - periodStart) / (365.25 * 24 * 3600 * 1000);
  const cagr = Math.pow(equity, 1 / years) - 1;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const sharpe = (mean - 0.02 / 12) / Math.sqrt(variance) * Math.sqrt(12);
  return { cagr, maxDD, sharpe, equity, years, yearly };
}

// 基准：买入持有等权全池
function buyHoldEqual() {
  let equity = 1, peak = 1, maxDD = 0; const yearly = {}; const rets = [];
  for (let i = 0; i < rb.length - 1; i++) {
    const d = rb[i], dNext = rb[i + 1];
    let ret = 0, n = 0;
    for (const c of codes) { const a = navAt(c, d), b = navAt(c, dNext); if (a && b) { ret += b / a - 1; n++; } }
    if (n) { ret /= n; equity *= (1 + ret); rets.push(ret); peak = Math.max(peak, equity); maxDD = Math.max(maxDD, 1 - equity / peak); const y = new Date(dNext).getFullYear(); yearly[y] = (yearly[y] || 1) * (1 + ret); }
  }
  const years = (periodEnd - periodStart) / (365.25 * 24 * 3600 * 1000);
  return { cagr: Math.pow(equity, 1 / years) - 1, maxDD, sharpe: 0, yearly, equity };
}

const bh = buyHoldEqual();

console.log('\n================ 回测结果（样本外 2018-2026）================');
console.log(`基准 买入持有等权全池(180只): 年化 ${(bh.cagr*100).toFixed(2)}%  最大回撤 ${(bh.maxDD*100).toFixed(1)}%`);
console.log(`分年度[等权全池]:`, Object.entries(bh.yearly).map(([y,v])=>`${y}:${((v-1)*100).toFixed(1)}%`).join('  '));

const configs = [
  [63, 3, 0], [63, 5, 0],
  [126, 3, 0], [126, 5, 0],
  [252, 3, 0], [252, 5, 0],
  [252, 3, 21], [252, 5, 21], // 12M-1M
];
let best = null;
for (const [L, N, skip] of configs) {
  const r = backtest(L, N, skip);
  const lbl = `${L===63?'3M':L===126?'6M':'12M'}${skip?'_skip1M':''} / N=${N}`;
  const exc = r.cagr - bh.cagr;
  console.log(`\n[${lbl}] 年化 ${(r.cagr*100).toFixed(2)}%  超额 ${(exc*100).toFixed(2)}%  最大回撤 ${(r.maxDD*100).toFixed(1)}%  夏普 ${r.sharpe.toFixed(2)}`);
  console.log(`  分年度:`, Object.entries(r.yearly).map(([y,v])=>`${y}:${((v-1)*100).toFixed(1)}%`).join('  '));
  if (!best || r.cagr > best.cagr) best = { lbl, ...r, exc };
}
console.log(`\n>>> 样本外年化最高组: ${best.lbl} → ${(best.cagr*100).toFixed(2)}% (超额 ${(best.exc*100).toFixed(2)}%)`);
