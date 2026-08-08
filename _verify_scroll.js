const puppeteer = require('puppeteer-core');
const fs = require('fs');

function findChrome(){
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for(const c of candidates){ if(fs.existsSync(c)) return c; }
  return null;
}

(async () => {
  const chrome = findChrome();
  if(!chrome){ console.log('NO_CHROME'); process.exit(2); }
  const html = fs.readFileSync('index.html','utf8');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width:1280, height:800 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push('PAGEERR: '+e.message));
  await page.setContent(html, { waitUntil:'domcontentloaded', timeout:20000 }).catch(e=>pageErrors.push('setContent:'+e));
  await new Promise(r=>setTimeout(r,500));

  // 进入行情看板
  await page.evaluate(()=>{ try{ showView('market'); }catch(e){} });
  await new Promise(r=>setTimeout(r,200));

  // 塞 30 个自选，制造超长列表
  const codes = ['sh600519','sz000001','sz000002','sh601318','sz300750','sh600036','sz000858','sh600276','sz002594','sh601012','sz300059','sh600900','sz000333','sh600030','sz002415','sh601888','sz300760','sh600887','sz000651','sh600009','sz002230','sh601166','sz300015','sh600104','sz000725','sh600048','sz002475','sh601398','sz300142','sh600000'];
  await page.evaluate((codes)=>{
    state.watch = codes.map(c=>({code:c,kind:'stock',name:c,cat:'def'}));
    state.selected = codes[0];
    save(); renderWatch();
  }, codes);
  await new Promise(r=>setTimeout(r,200));

  // R1: 列表是否可滚动 + market-page 自身 overflow
  const r1 = await page.evaluate(()=>{
    const wb=document.getElementById('watchBox');
    const mp=document.getElementById('viewMarket');
    const th=wb.querySelector('thead th');
    return {
      hasScroll: wb.scrollHeight > wb.clientHeight + 2,
      wbScrollH: wb.scrollHeight, wbClientH: wb.clientHeight,
      thTopBefore: th.getBoundingClientRect().top,
      wbTop: wb.getBoundingClientRect().top,
      selBefore: state.selected,
      mpOverflow: getComputedStyle(mp).overflow
    };
  });

  // R2: 滚动 #watchBox 后，表头应吸顶、内容行滚走
  await page.evaluate(()=>{ document.getElementById('watchBox').scrollTop = 140; });
  await new Promise(r=>setTimeout(r,150));
  const r2 = await page.evaluate(()=>{
    const wb=document.getElementById('watchBox');
    const th=wb.querySelector('thead th');
    const firstRow=wb.querySelector('tbody tr');
    const thTop=th.getBoundingClientRect().top;
    const wbTop=wb.getBoundingClientRect().top;
    return {
      scrollTop: wb.scrollTop,
      thSticky: Math.abs(thTop-wbTop) < 2,
      rowScrolledAway: firstRow.getBoundingClientRect().top < wbTop,
      thTop, wbTop
    };
  });

  // R3: 派发滚轮，确认不再切标的（installWatchWheel 已移除）
  await page.evaluate(()=>{
    const wb=document.getElementById('watchBox');
    wb.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
  });
  await new Promise(r=>setTimeout(r,150));
  const r3 = await page.evaluate(()=>({ selAfterWheel: state.selected }));

  // R4: market-page 自身不应滚动（右侧 K 线不随左栏滚动而整体移动）
  const r4 = await page.evaluate(()=>{
    const mp=document.getElementById('viewMarket');
    return { mpScrollTop: mp.scrollTop, mpScrollH: mp.scrollHeight, mpClientH: mp.clientHeight };
  });

  console.log('R1(列表可滚/页本身overflow):', r1);
  console.log('R2(滚动后表头吸顶/内容滚走):', r2);
  console.log('R3(滚轮后selected是否变):', r3, '=> 不变才对');
  console.log('R4(market-page自身scrollTop):', r4, '=> 0 才对');
  console.log('pageErrors:', pageErrors.length, pageErrors.slice(0,5));

  const ok = r1.hasScroll
    && r2.thSticky
    && r2.rowScrolledAway
    && r3.selAfterWheel === r1.selBefore
    && r1.mpOverflow.indexOf('hidden') >= 0
    && r4.mpScrollTop === 0
    && pageErrors.length === 0;

  console.log(ok ? 'PASS ✓' : 'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})();
