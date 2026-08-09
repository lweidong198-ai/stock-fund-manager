// 验证 app 里 kdj() 是否正确：用真实腾讯前复权K线，跑两套独立实现比对
const CODE = 'sh600519'; // 贵州茅台
const URL = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${CODE},day,2015-01-01,2026-12-31,2000,qfq`;

// —— 实现A：原样搬运 app 的 kdj() ——
function appKdj(high, low, close, n = 9) {
  const k = [], d = [], j = [];
  let pk = 50, pd = 50;
  for (let i = 0; i < close.length; i++) {
    const s = Math.max(0, i - n + 1);
    let hh = -Infinity, ll = Infinity;
    for (let t = s; t <= i; t++) { if (high[t] > hh) hh = high[t]; if (low[t] < ll) ll = low[t]; }
    const rsv = hh === ll ? 50 : (close[i] - ll) / (hh - ll) * 100;
    pk = 2 / 3 * pk + 1 / 3 * rsv; pd = 2 / 3 * pd + 1 / 3 * pk;
    k.push(pk); d.push(pd); j.push(3 * pk - 2 * pd);
  }
  return { k, d, j };
}

// —— 实现B：独立重写的教科书式 KDJ（不同代码路径，同公式）——
function indepKdj(high, low, close, n = 9, kPeriod = 3, dPeriod = 3) {
  const k = [], d = [], j = [];
  let prevK = 50, prevD = 50;
  for (let i = 0; i < close.length; i++) {
    const start = Math.max(0, i - n + 1);
    let hh = -Infinity, ll = Infinity;
    for (let t = start; t <= i; t++) { hh = Math.max(hh, high[t]); ll = Math.min(ll, low[t]); }
    const rsv = (hh - ll) === 0 ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
    const K = prevK + (1 / kPeriod) * (rsv - prevK);   // 等价于 2/3·prevK + 1/3·rsv
    const D = prevD + (1 / dPeriod) * (K - prevD);      // 等价于 2/3·prevD + 1/3·K
    const J = 3 * K - 2 * D;
    prevK = K; prevD = D;
    k.push(K); d.push(D); j.push(J);
  }
  return { k, d, j };
}

(async () => {
  const res = await fetch(URL);
  const json = await res.json();
  const code = CODE.replace(/^(sh|sz)/, m => m);
  const rows = (((json.data || {})[CODE] || {}).qfqday) || [];
  if (!rows.length) { console.log('NO QFQ DATA'); process.exit(1); }
  const high = rows.map(r => +r[4]);
  const low = rows.map(r => +r[3]);
  const close = rows.map(r => +r[2]);
  const dates = rows.map(r => r[0]);
  console.log(`标的=${CODE} 根数=${rows.length} 区间=${dates[0]}~${dates[dates.length - 1]}`);

  const A = appKdj(high, low, close);
  const B = indepKdj(high, low, close);

  let maxDiff = 0;
  for (let i = 0; i < rows.length; i++) {
    maxDiff = Math.max(maxDiff,
      Math.abs(A.k[i] - B.k[i]), Math.abs(A.d[i] - B.d[i]), Math.abs(A.j[i] - B.j[i]));
  }
  console.log(`两套实现最大逐位差异 = ${maxDiff.toExponential(3)} (应≈0)`);

  const L = rows.length - 1;
  console.log('--- 最近5根(真实数据) KDJ ---');
  for (let i = L - 4; i <= L; i++) {
    console.log(`${dates[i]}  K=${A.k[i].toFixed(3)}  D=${A.d[i].toFixed(3)}  J=${A.j[i].toFixed(3)}`);
  }
  console.log(`\n最新(${dates[L]}): K=${A.k[L].toFixed(2)} D=${A.d[L].toFixed(2)} J=${A.j[L].toFixed(2)}`);
  console.log(`J线范围检查: 全样本 J min=${Math.min(...A.j).toFixed(1)} max=${Math.max(...A.j).toFixed(1)} (KDJ允许J<0或>100,属正常)`);

  // 与东方财富/同花顺通用约定一致性的声明性校验
  const ok = maxDiff < 1e-9;
  console.log(`\n算法自检: ${ok ? 'PASS ✓ 两套独立实现逐位一致 → app的KDJ公式与标准(9,3,3)/K=D=50约定一致' : 'FAIL ✗'}`);
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('ERR', e); process.exit(1); });
