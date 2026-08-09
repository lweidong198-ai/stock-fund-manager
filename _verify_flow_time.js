const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function findChrome(){
  const roots = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for(const p of roots){ if(fs.existsSync(p)) return p; }
  return null;
}
const CHROME = findChrome();
const FILE = 'file://' + path.resolve('index.html');

(async()=>{
  const errors=[];
  const browser = await puppeteer.launch({ executablePath:CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e=>errors.push('PAGEERR: '+e.message));
  page.on('console', m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
  await page.goto(FILE, {waitUntil:'networkidle2'});

  // 注入：茅台真实 structure 的 quotes（腾讯内外盘+五档+time）
  await page.evaluate(()=>{
    state.watch = [{code:'sh600519', kind:'stock', name:'贵州茅台'}];
    state.selected = 'sh600519';
    state.quotes['sh600519'] = {
      code:'sh600519', name:'贵州茅台', price:1480, changePct:-1.2,
      outer:350000, inner:520000, time:'20260807150000',
      bid:[[1480,100],[1479,200],[1478,150],[1477,300],[1476,250]],
      ask:[[1481,120],[1482,180],[1483,160],[1484,220],[1485,140]]
    };
  });

  // 场景A：东财成功
  await page.evaluate(()=>{
    window.loadFundFlow = function(code, cb){
      cb({ main:-116062619, mainPct:-2.53, time:'2026-08-07 15:00', raw:['2026-08-07 15:00','-116062619','-252554','116315180','-108712639','-7349980','-2.53'] });
    };
    goView('flow');
  });
  await new Promise(r=>setTimeout(r,400));
  const A = await page.evaluate(()=>{
    const c=document.getElementById('flowMainCard'), t=document.getElementById('flowMainTime');
    return { card:c?c.innerText:'', time:t?t.innerText:'' };
  });

  // 场景B：东财失败(net) → 应回退腾讯内外盘估算
  await page.evaluate(()=>{
    window.loadFundFlow = function(code, cb){ cb({err:'net'}); };
    goView('flow');
  });
  await new Promise(r=>setTimeout(r,400));
  const B = await page.evaluate(()=>{
    const c=document.getElementById('flowMainCard'), t=document.getElementById('flowMainTime');
    return { card:c?c.innerText:'', time:t?t.innerText:'', hasFail:c?c.innerText.includes('获取失败'):false };
  });

  console.log('=== 场景A(东财成功) ===');
  console.log('card:', JSON.stringify(A.card));
  console.log('time:', JSON.stringify(A.time));
  console.log('=== 场景B(东财失败→回退估算) ===');
  console.log('card:', JSON.stringify(B.card));
  console.log('time:', JSON.stringify(B.time));
  console.log('场景B仍显示"获取失败"?', B.hasFail);
  console.log('JS errors:', errors.length, errors.slice(0,3));

  const okA = A.card.includes('-1.16') && A.time.includes('数据时间') && A.time.includes('2026-08-07 15:00');
  const okB = !B.hasFail && B.card.includes('手') && B.card.includes('内外盘估算') && B.time.includes('腾讯内外盘');
  const ok = okA && okB && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ 时间标注+东财失败回退估算均正常' : 'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
