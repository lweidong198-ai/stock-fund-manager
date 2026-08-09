// 验证「预测层」：walk-forward 样本外样本 → 预测器 → 列表/详情/校准表
const puppeteer=require('puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--disable-setuid-sandbox']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERR: '+e.message));
  page.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(!/net::ERR|Failed to fetch|gtimg|eastmoney|fqkline|ERR_FAILED|Failed to load resource|404|favicon/i.test(t)) errors.push('CONSOLE: '+t); } });
  await page.goto('http://localhost:8788/', {waitUntil:'networkidle2', timeout:60000}).catch(()=>{});
  await sleep(1500);
  if(errors.length) console.log('LOAD_ERRORS', JSON.stringify(errors.slice(0,5)));

  // ---- 1) mock 纯逻辑：预测器结构 ----
  const mock = await page.evaluate(()=>{
    function gen(seed){
      const kl=[]; let p=100;
      for(let i=0;i<520;i++){ p = p*(1 + Math.sin(i*0.13+seed)*0.003 + (Math.random()-0.5)*0.012); kl.push({date:'d'+i, open:p, high:p*1.01, low:p*0.99, close:p, vol:1000}); }
      return kl;
    }
    const allKl={}; for(let k=0;k<14;k++){ allKl['E'+k]=gen(k+1); }
    const bt=runBacktest(allKl);
    if(!bt) return {hasBt:false};
    const P=bt.pred;
    const p1=predictFrom(bt,-1.5), p2=predictFrom(bt,0), p3=predictFrom(bt,1.5);
    const wsum=bt.weights.vol+bt.weights.mom120+bt.weights.rev5;
    return {
      hasBt:true, nSamples:bt.nSamples, hasPred:!!P,
      bands: P? P.bands.length : 0,
      bandNs: P? P.bands.map(b=>b.n) : [],
      predN: P? P.n : 0,
      slope20: P? +P.ols20.b.toFixed(3) : null, slope60: P? +P.ols60.b.toFixed(3) : null, slopeT60: P? +P.ols60.t.toFixed(2) : null,
      slopeT: P? +P.ols20.t.toFixed(2) : null,
      r2: P? +(P.ols20.r2*100).toFixed(2) : null,
      p1:p1?{ex60:+p1.ex60.toFixed(2), ex20:+p1.ex20.toFixed(2), pUp20:+p1.pUp20.toFixed(1), band:p1.band, conf:p1.conf}:null,
      p2:p2?{ex20:+p2.ex20.toFixed(2), band:p2.band}:null,
      p3:p3?{ex60:+p3.ex60.toFixed(2), ex20:+p3.ex20.toFixed(2), pUp20:+p3.pUp20.toFixed(1), band:p3.band, conf:p3.conf}:null,
      weightsSum:+wsum.toFixed(3),
      longShort:+bt.longShortH.toFixed(2), horizon:bt.horizon,
      lsIsNum: typeof bt.longShort20==='number' && isFinite(bt.longShort20)
    };
  });
  console.log('MOCK', JSON.stringify(mock));

  // 单调性：预测值方向必须与回归斜率符号一致（斜率正→z越大预测越高）
  let monoOK=false;
  if(mock.hasPred && mock.p1 && mock.p3){
    monoOK = mock.slope60>=0 ? (mock.p3.ex60 > mock.p1.ex60) : (mock.p3.ex60 < mock.p1.ex60);
  }
  console.log('MONOTONIC_OK', monoOK, 'slope60=',mock.slope60,'t60=',mock.slopeT60);

  // ---- 2) 真实扫描：列表/详情/校准表 ----
  await page.evaluate(()=>{ try{ goView('fund'); renderOpportunities(); }catch(e){ console.error('EVAL_ERR',e.message); } });
  let ready=false;
  for(let i=0;i<45;i++){ await sleep(2000); const ok=await page.evaluate(()=> !!(OPP_CACHE && OPP_CACHE.bt && (OPP_CACHE.rows||[]).length)); if(ok){ ready=true; break; } }
  const real=await page.evaluate(()=>{
    const bt=OPP_CACHE?OPP_CACHE.bt:null, rows=(OPP_CACHE&&OPP_CACHE.rows)||[];
    if(!bt) return {bt:false};
    const withPred=rows.filter(r=>r&&r.pred).length;
    const sample=rows.filter(r=>r&&r.pred).slice(0,3).map(r=>({
      name:r.name, opp:r.comp.opp, ex20:+r.pred.ex20.toFixed(2), ex60:+r.pred.ex60.toFixed(2),
      pUp20:Math.round(r.pred.pUp20), conf:r.pred.conf
    }));
    const listHtml=(document.getElementById('oppList')||{}).innerHTML||'';
    const btHtml=(document.getElementById('btBody')||{}).innerHTML||'';
    // 触发详情
    let cardsHtml='';
    try{ if(rows.length){ selectOpp(rows[0].code); cardsHtml=(document.getElementById('oppCards')||{}).innerHTML||''; } }catch(e){}
    return {
      bt:true, rows:rows.length, withPred, sample,
      predN: bt.pred? bt.pred.n : 0,
      slopeT60: bt.pred? +bt.pred.ols60.t.toFixed(2):null, slope60: bt.pred? +bt.pred.ols60.b.toFixed(3):null, slopeT20: bt.pred? +bt.pred.ols20.t.toFixed(2):null,
      
      compIc:+bt.ic.comp.ic.toFixed(4), compT:+bt.ic.comp.t.toFixed(2), flip:bt.flip, nPoints:bt.nPoints, dateFrom:bt.dateFrom, dateTo:bt.dateTo, seg:(bt.segCheck?{a:+bt.segCheck.raw1.ic.toFixed(4),at:+bt.segCheck.raw1.t.toFixed(2),an:bt.segCheck.raw1.n,b:+bt.segCheck.raw2.ic.toFixed(4),bt:+bt.segCheck.raw2.t.toFixed(2),bn:bt.segCheck.raw2.n}:null),
      longShort:+bt.longShortH.toFixed(2), horizon:bt.horizon,
      listHasPred: listHtml.indexOf('预测·未来60日')>=0,
      listHasProb: listHtml.indexOf('跑赢概率')>=0,
      listNaN: /NaN/.test(listHtml),
      btHasCalib: btHtml.indexOf('预测校准表')>=0,
      btHasSlope: btHtml.indexOf('R²')>=0,
      btNaN: /NaN/.test(btHtml),
      cardHasPred20: cardsHtml.indexOf('预测·未来60日超额（主）')>=0,
      cardHasPred60: cardsHtml.indexOf('预测·未来20日超额（参考）')>=0
    };
  });
  console.log('REAL', JSON.stringify(real));
  console.log('READY', ready);

  const ok = mock.hasBt && mock.hasPred && mock.bands===5 && mock.predN>=60
          && mock.p1 && mock.p2 && mock.p3 && monoOK
          && Math.abs(mock.weightsSum-1)<0.02 && mock.lsIsNum
          && real.bt && real.rows>=10 && real.withPred>=10
          && real.listHasPred && real.listHasProb && !real.listNaN
          && real.btHasCalib && real.btHasSlope && !real.btNaN
          && real.cardHasPred20 && real.cardHasPred60
          && errors.length===0;
  if(errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0,6)));
  console.log(ok? 'VERIFY_PRED_PASS' : 'VERIFY_PRED_FAIL');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error(e); process.exit(1); });
