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

  // 1) mock 数据验证 runBacktest 纯逻辑(>=10只, 不依赖网络)
  const mock = await page.evaluate(()=>{
    function gen(seed){
      const kl=[]; let p=100;
      for(let i=0;i<500;i++){ p = p*(1 + Math.sin(i*0.13+seed)*0.003 + (Math.random()-0.5)*0.012); kl.push({date:'d'+i, open:p, high:p*1.01, low:p*0.99, close:p, vol:1000}); }
      return kl;
    }
    const allKl={}; for(let k=0;k<12;k++){ allKl['E'+k]=gen(k+1); }
    const bt=runBacktest(allKl);
    if(!bt) return {hasBt:false};
    return {hasBt:true, nPoints:bt.nPoints, quintLen:bt.quint20.length, quint60Len:bt.quint60.length,
            weightsSum:bt.weights.mom+bt.weights.val+bt.weights.lowvol, hasIc:(typeof bt.ic.comp.ic==='number')};
  });
  console.log('MOCK', JSON.stringify(mock));

  // 2) 真实扫描 + 回测渲染
  await page.evaluate(()=>{ try{ goView('fund'); renderOpportunities(); }catch(e){ console.error('EVAL_ERR',e.message); } });
  let btReady=false;
  for(let i=0;i<45;i++){ await sleep(2000); const ok=await page.evaluate(()=> !!(OPP_CACHE && OPP_CACHE.bt)); if(ok){ btReady=true; break; } }
  const res=await page.evaluate(()=>{
    const bt=OPP_CACHE?OPP_CACHE.bt:null; const body=document.getElementById('btBody');
    if(!bt) return {bt:false};
    return { bt:true, nPoints:bt.nPoints, hasRows:(OPP_CACHE.rows||[]).length,
             compIc:+bt.ic.comp.ic.toFixed(4), compT:+bt.ic.comp.t.toFixed(2),
             quint:bt.quint20.map(x=>+x.toFixed(2)),
             longShort:+bt.longShort20.toFixed(2),
             weights:bt.weights,
             bodyHasRankIC: body? body.innerHTML.indexOf('RankIC')>=0 : false,
             bodyHasWeight: body? body.innerHTML.indexOf('因子权重')>=0 : false,
             bodyHasQuint: body? body.innerHTML.indexOf('多空收益')>=0 : false,
             bodyHasNote: body? body.innerHTML.indexOf('Jegadeesh')>=0 : false };
  });
  console.log('REAL', JSON.stringify(res));
  console.log('BT_READY', btReady);

  const ok = mock.hasBt && mock.quintLen===5 && mock.quint60Len===5 && Math.abs(mock.weightsSum-1)<0.02 && mock.hasIc
           && res.bt && res.nPoints>=8 && res.hasRows>=10
           && res.bodyHasRankIC && res.bodyHasWeight && res.bodyHasQuint && res.bodyHasNote
           && errors.length===0;
  console.log(ok? 'VERIFY_BACKTEST_PASS' : 'VERIFY_BACKTEST_FAIL');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error(e); process.exit(1); });
