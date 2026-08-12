// 批量拉取基金池中每只的真实累计净值(Data_ACWorthTrend)，存紧凑缓存
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const fs = require('fs');
const pool = JSON.parse(fs.readFileSync('fund_pool.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(code) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`, {
        headers: { 'User-Agent': UA, 'Referer': 'https://fund.eastmoney.com/' }, signal: ctrl.signal
      });
      clearTimeout(t);
      const txt = await r.text();
      const m = txt.match(/Data_ACWorthTrend\s*=\s*(\[\[[\s\S]*?\]\])/);
      if (m) {
        const arr = JSON.parse(m[1]);
        if (arr.length > 20) return arr; // [[ts, val], ...]
      }
      return null;
    } catch (e) {
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

async function run(concurrency = 8) {
  const cache = {};
  let done = 0, ok = 0;
  const queue = pool.map(p => p.code);
  async function worker() {
    while (queue.length) {
      const code = queue.shift();
      const arr = await fetchOne(code);
      done++; ok += arr ? 1 : 0;
      if (arr) cache[code] = arr;
      if (done % 10 === 0) console.log(`  进度 ${done}/${pool.length} 成功 ${ok}`);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, worker);
  await Promise.all(workers);
  fs.writeFileSync('fund_nav_cache.json', JSON.stringify(cache));
  console.log(`净值拉取完成: ${ok}/${pool.length} 只成功，缓存大小 ${(JSON.stringify(cache).length/1024/1024).toFixed(1)}MB`);
}
run();
