const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

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
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });

  const htmlPath = path.join(__dirname,'index.html');
  // 种子：4 只纯股票自选，避免切换视图干扰断言
  const seed = `
    try{
      const demo = [
        {code:'sh600519', kind:'stock'},
        {code:'sz000001', kind:'stock'},
        {code:'sh510300', kind:'stock'},
        {code:'hk00700', kind:'stock'}
      ];
      localStorage.setItem('sfm_watch_v2', JSON.stringify(demo));
    }catch(e){}
  `;
  await page.evaluateOnNewDocument(seed);
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
  await new Promise(r=>setTimeout(r,300));

  // 进入行情看板
  await page.click('.navitem[data-view="market"]');
  await new Promise(r=>setTimeout(r,300));

  // 先点第一行，制造一个初始选中
  await page.evaluate(()=>{ const r=document.querySelector('#watchBox tr.wl-row'); if(r) r.click(); });
  await new Promise(r=>setTimeout(r,200));

  const readSel = ()=>page.evaluate(()=>{ const r=document.querySelector('#watchBox tr.wl-row.sel'); return r?r.dataset.code:null; });
  const wheel = (dy)=>page.evaluate((d)=>{ const wb=document.getElementById('watchBox'); wb.dispatchEvent(new WheelEvent('wheel',{deltaY:d,bubbles:true,cancelable:true})); }, dy);

  const before = await readSel();
  await wheel(120); await new Promise(r=>setTimeout(r,200)); const down1 = await readSel();
  await wheel(120); await new Promise(r=>setTimeout(r,200)); const down2 = await readSel();
  await wheel(-120); await new Promise(r=>setTimeout(r,200)); const up1 = await readSel();
  // 连续下滚到第 4 只后 wrap 回第 1 只（验证循环无越界）
  await wheel(120); await new Promise(r=>setTimeout(r,200)); const down3 = await readSel();
  await wheel(120); await new Promise(r=>setTimeout(r,200)); const down4 = await readSel();
  await wheel(120); await new Promise(r=>setTimeout(r,200)); const wrap = await readSel();

  await browser.close();

  console.log('before:', before);
  console.log('down1 :', down1);
  console.log('down2 :', down2);
  console.log('up1   :', up1, '(应回到 down1)');
  console.log('down3 :', down3, '(从up1的index1下滚回到index2, 恰等于down2, 合法)');
  console.log('down4 :', down4);
  console.log('wrap  :', wrap, '(4只后再下滚应绕回 before)');
  console.log('JS errors:', errors.length, errors.slice(0,5));

  // 预期索引: before=0, down1=1, down2=2, up1=1, down3=2, down4=3, wrap=0
  const ok = !!before && down1 && down1!==before
    && down2 && down2!==down1
    && up1===down1
    && down3 && down3===down2          // 从 index1 下滚回到 index2，恰等于 down2（合法相等）
    && down4 && down4!==down3          // index3 推进
    && wrap===before                   // 第4只后再下滚绕回 index0
    && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ 自选区滚轮切换标的: 下滚→下一只/上滚→上一只/可循环回绕, 无报错' : 'FAIL ✗');
  process.exit(ok?0:1);
})().catch(e=>{ console.error(e); process.exit(3); });
