// 因子挖掘探索：在真实44只行业ETF日K上，对每个候选因子算样本内/样本外 RankIC
// 目标：找出在当前样本期真正有效的规律（哪些因子IC显著为正且样本外稳定）
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8788/', { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
  await sleep(2000);

  const result = await page.evaluate(async () => {
    const FNS = { klinePct, pricePct, calcVol, calcBias, calcRSI, spearman, rank, zscore, mean, std, clamp };
    const POOL = INDUSTRY_POOL.concat(loadCustomSectors ? loadCustomSectors() : []);
    // 加载K线
    const kls = {};
    for (const x of POOL) {
      try {
        const kl = await loadKlineP(x.code, 'd');
        if (kl && kl.length >= 260) kls[x.code] = kl;
      } catch (e) {}
    }
    const codes = Object.keys(kls);
    const L = Math.min(...codes.map(c => kls[c].length));
    const T0 = 120, step = 20, TEnd = Math.max(T0, L - 60);
    const times = [];
    for (let T = T0; T <= TEnd; T += step) times.push(T);
    const split = Math.floor(times.length * 0.6);
    const inT = times.slice(0, split), outT = times.slice(split);

    // 候选因子（因子值越大=越看多）
    function factorsAt(kl, T) {
      const sub = kl.slice(0, T + 1);
      const closes = sub.map(b => b.close);
      const n = sub.length;
      const kp = nn => (n >= nn + 1) ? klinePct(sub, nn) : null;
      const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
      const v5 = avg(sub.slice(Math.max(0, n - 5)).map(b => b.volume));
      const v60 = avg(sub.slice(Math.max(0, n - 60)).map(b => b.volume));
      const f = {};
      f.mom20 = kp(20);
      f.mom60 = kp(60);
      f.mom120 = kp(120);
      const r5 = kp(5); f.rev5 = (r5 != null) ? -r5 : null;
      const r20 = kp(20); f.rev20 = (r20 != null) ? -r20 : null;
      f.val1 = pricePct(sub, 1);
      f.val3 = pricePct(sub, 3);
      f.lowvol = -FNS.calcVol(closes).ann;
      f.volR = v60 > 0 ? v5 / v60 : 1;
      f.bias = -FNS.calcBias(closes, 20);
      f.rsi = -(FNS.calcRSI(closes, 14) - 50);
      return f;
    }
    const FNAMES = ['mom20','mom60','mom120','rev5','rev20','val1','val3','lowvol','volR','bias','rsi'];

    // 在给定时点上，对每个因子算平均 RankIC（对未来20/60日）
    function icOver(times, fwd) {
      const perF = {}; FNAMES.forEach(f => perF[f] = []);
      for (const T of times) {
        const fac = {}, ret20 = {}, ret60 = {};
        let ok = true;
        for (const c of codes) {
          const kl = kls[c];
          if (T >= kl.length) { ok = false; break; }
          const f = factorsAt(kl, T);
          const T20 = Math.min(T + 20, kl.length - 1), T60 = Math.min(T + 60, kl.length - 1);
          fac[c] = f; ret20[c] = (kl[T20].close - kl[T].close) / kl[T].close * 100; ret60[c] = (kl[T60].close - kl[T].close) / kl[T].close * 100;
        }
        if (!ok) continue;
        const cs = Object.keys(fac);
        for (const fname of FNAMES) {
          const fv = cs.map(c => fac[c][fname]).filter(v => v != null);
          const rr = cs.filter(c => fac[c][fname] != null).map(c => (fwd === 20 ? ret20[c] : ret60[c]));
          if (fv.length >= 8 && rr.length >= 8) {
            const ic = spearman(fv, rr);
            if (!isNaN(ic)) perF[fname].push(ic);
          }
        }
      }
      const out = {};
      for (const fname of FNAMES) {
        const a = perF[fname];
        if (a.length < 3) { out[fname] = { ic: NaN, t: NaN, n: a.length }; continue; }
        const m = mean(a), s = std(a);
        out[fname] = { ic: m, t: s === 0 ? 0 : m / (s / Math.sqrt(a.length)), n: a.length };
      }
      return out;
    }

    const in20 = icOver(inT, 20), in60 = icOver(inT, 60);
    const out20 = icOver(outT, 20), out60 = icOver(outT, 60);

    // 挖掘：样本内显著正因子（t>1.0, ic>0.02），权重=|ic|
    const chosen = FNAMES.filter(f => in20[f].ic != null && in20[f].ic > 0.02 && in20[f].t > 1.0);
    const s = chosen.reduce((a, f) => a + Math.abs(in20[f].ic), 0) || 1;
    const W = {}; chosen.forEach(f => W[f] = Math.abs(in20[f].ic) / s);

    // 样本外验证：用 chosen+W 算综合分 IC
    function compOOSIC() {
      const ics = [];
      for (const T of outT) {
        const fac = {}, ret20 = {};
        let ok = true;
        for (const c of codes) {
          const kl = kls[c]; if (T >= kl.length) { ok = false; break; }
          const f = factorsAt(kl, T);
          const T20 = Math.min(T + 20, kl.length - 1);
          fac[c] = f; ret20[c] = (kl[T20].close - kl[T].close) / kl[T].close * 100;
        }
        if (!ok) continue;
        const cs = Object.keys(fac).filter(c => chosen.every(f => fac[c][f] != null));
        if (cs.length < 8) continue;
        const comp = cs.map(c => chosen.reduce((a, f) => a + W[f] * fac[c][f], 0));
        const rr = cs.map(c => ret20[c]);
        ics.push(spearman(comp, rr));
      }
      const m = mean(ics), sd = std(ics);
      return { ic: m, t: sd === 0 ? 0 : m / (sd / Math.sqrt(ics.length)), n: ics.length, chosen, W };
    }
    const oos = compOOSIC();

    return {
      nCodes: codes.length, L, nIn: inT.length, nOut: outT.length,
      in20, in60, out20, out60,
      chosen, W, oos
    };
  });

  console.log('=== 因子挖掘探索结果 ===');
  console.log('codes=' + result.nCodes + ' L=' + result.L + ' inPts=' + result.nIn + ' outPts=' + result.nOut);
  console.log('\n因子 | 样本内IC(20d) | t | 样本内IC(60d) | 样本外IC(20d) | t | 样本外IC(60d)');
  const F = ['mom20','mom60','mom120','rev5','rev20','val1','val3','lowvol','volR','bias','rsi'];
  for (const f of F) {
    const i2 = result.in20[f], i6 = result.in60[f], o2 = result.out20[f], o6 = result.out60[f];
    const fmt = o => (o.ic == null || isNaN(o.ic)) ? '  -  ' : (o.ic>=0?'+':'') + o.ic.toFixed(3) + '(' + o.t.toFixed(1) + ')';
    console.log(f.padEnd(9) + ' | ' + fmt(i2) + ' | ' + fmt(i6) + ' | ' + fmt(o2) + ' | ' + fmt(o6));
  }
  console.log('\n=== 挖掘出的显著因子(样本内 IC>0.02 且 t>1.0) ===');
  console.log('chosen=' + JSON.stringify(result.chosen));
  console.log('weights=' + JSON.stringify(result.W, null, 0));
  console.log('样本外综合分IC(20d)= ' + (isNaN(result.oos.ic) ? 'NA' : result.oos.ic.toFixed(3) + ' (t=' + result.oos.t.toFixed(2) + ', n=' + result.oos.n + ')'));
  console.log('\n页面错误数=' + errs.length);
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
