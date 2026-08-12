// 拉主动权益基金池：股票型(gp)+混合型(hh)，保留成立日<=2015-12-31（有长期数据做walk-forward）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const fs = require('fs');

function parseRank(text) {
  const marker = 'datas:[';
  const i = text.indexOf(marker);
  if (i < 0) return { rows: [], total: 0 };
  const j = i + marker.length;
  const end = text.indexOf(']', j);
  const body = text.slice(j, end);
  const arr = body.match(/"[^"]*(?:""[^"]*)*"/g) || [];
  const rows = arr.map(s => s.slice(1, -1).replace(/""/g, '"').split(','));
  const tm = text.match(/allRecords\s*:\s*"(\d+)"/);
  const total = tm ? parseInt(tm[1], 10) : rows.length;
  return { rows, total };
}

function foundedDate(row) {
  // 找所有 YYYY-MM-DD 字段，取年份最小者作为成立日
  let min = null;
  for (const f of row) {
    const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
    if (mm && mm[1] <= '2015') {
      const d = f;
      if (min === null || d < min) min = d;
    }
  }
  return min;
}

async function fetchType(ft, maxPages = 30) {
  let all = [];
  for (let pi = 1; pi <= maxPages; pi++) {
    const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=${ft}&rs=&gs=0&sc=zzf&st=desc&sd=2000-01-01&ed=2026-08-12&qdii=&tabSubtype=,,,,,&pi=${pi}&pn=500&_=${Date.now()}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://fund.eastmoney.com/' }, signal: ctrl.signal });
      clearTimeout(t);
      const txt = await r.text();
      const { rows } = parseRank(txt);
      all.push(...rows);
      if (rows.length === 0 || rows.length < 500) break;
    } catch (e) {
      console.log(`  [${ft}] page ${pi} err: ${e.message}`);
      break;
    }
  }
  return all;
}

(async () => {
  console.log('拉股票型(gp)...');
  const gp = await fetchType('gp', 40);
  console.log('拉混合型(hh)...');
  const hh = await fetchType('hh', 40);
  console.log(`原始: gp=${gp.length}, hh=${hh.length}`);

  const seen = new Set();
  const pool = [];
  for (const row of [...gp, ...hh]) {
    const code = row[0];
    const name = row[1] || '';
    if (!code || seen.has(code)) continue;
    // 排除明显被动/非权益
    if (/(指数|ETF|QDII|债券|货币|理财|短债|中短债|纯债|增强指数)/.test(name)) continue;
    const fd = foundedDate(row);
    if (!fd || fd > '2015-12-31') continue;
    seen.add(code);
    pool.push({ code, name, founded: fd });
  }
  // 按成立日升序（最早的优先，数据最长），稳定可复现
  pool.sort((a, b) => (a.founded < b.founded ? -1 : a.founded > b.founded ? 1 : a.code.localeCompare(b.code)));
  // 控制规模上限，避免请求爆炸
  const CAP = 600;
  const chosen = pool.slice(0, CAP);
  fs.writeFileSync('fund_pool.json', JSON.stringify(chosen, null, 0));
  console.log(`主动权益池(成立<=2015-12-31, 排除指数/债/货): ${pool.length} 只; 本次取前 ${chosen.length} 只建缓存`);
  console.log('样例:', chosen.slice(0, 3).map(x => x.code + ' ' + x.name + '(' + x.founded + ')').join(' | '));
})();
