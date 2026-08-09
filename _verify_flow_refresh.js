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

  // 注入行情：茅台，带 time 字段（14位时间戳）
  await page.evaluate(()=>{
    state.watch = [{code:'sh600519', kind:'stock', name:'贵州茅台'}];
    state.selected = 'sh600519';
    state.quotes['sh600519'] = {
      code:'sh600519', name:'贵州茅台', price:1480, changePct:-1.2,
      outer:350000, inner:520000, time:'20260807150000',
      bid:[[1480,100],[1479,200],[1478,150],[1477,300],[1476,250]],
      ask:[[1481,120],[1482,180],[1483,160],[1484,220],[1485,140]]
    };
    // 禁用东财网络（沙箱连不上），直接给成功结构
    window.loadFundFlow = function(code, cb){ cb({ main:-116062619, mainPct:-2.53, time:'2026-08-07 15:00', raw:['2026-08-07 15:00','-116062619','-252554','116315180','-108712639','-7349980','-2.53'] }); };
    goView('flow');
  });
  await new Promise(r=>setTimeout(r,400));

  // —— 断言1：左卡"选中标的资金力道"带数据时间 + 去掉"实时" ——
  const A = await page.evaluate(()=>{
    const el=document.getElementById('flowSel');
    return { txt: el?el.innerText:'', hasTime: el?el.innerText.includes('数据时间'):false, hasFmt: el?el.innerText.includes('2026-08-07 15:00:00'):false, hasReal: el?el.innerText.includes('实时'):false };
  });

  // —— 断言2：手动刷新按钮存在 ——
  const B = await page.evaluate(()=>!!document.getElementById('btnFlowRefresh'));

  // —— 断言3：点手动刷新按钮 → 拉取快照并写"上次刷新" ——
  await page.evaluate(()=>{ window.refreshQuotes = function(cb){ if(typeof cb==='function') cb(); }; });
  await page.click('#btnFlowRefresh');
  await new Promise(r=>setTimeout(r,200));
  const C = await page.evaluate(()=>{ const t=document.getElementById('flowRefreshTime'); return t?t.innerText:''; });

  // —— 断言4：自动刷新链路已摘除 flow（onQuotesUpdated 不再触发 renderFlow）——
  const D = await page.evaluate(()=>{
    const orig = window.renderFlow; let calls=0;
    window.renderFlow = function(){ calls++; return orig.apply(this, arguments); };
    goView('flow');              // 进入视图会调一次
    calls = 0;                   // 重置计数
    onQuotesUpdated();           // 模拟全局自动刷新定时器触发的回调
    const afterAuto = calls;     // 期望仍为 0（flow 不在自动链里）
    window.refreshQuotes = function(cb){ if(typeof cb==='function') cb(); }; // 复用上面的覆盖
    refreshFlow();               // 手动刷新应触发一次
    const afterManual = calls;   // 期望 >=1
    window.renderFlow = orig;
    return { afterAuto, afterManual };
  });

  console.log('=== 断言1 左卡时间标注 ===');
  console.log('hasTime(数据时间):', A.hasTime, '| hasFmt(2026-08-07 15:00:00):', A.hasFmt, '| 残留"实时":', A.hasReal);
  console.log('=== 断言2 手动刷新按钮存在 ===', B);
  console.log('=== 断言3 点击后"上次刷新" ===', JSON.stringify(C));
  console.log('=== 断言4 自动链路摘除 ===');
  console.log('onQuotesUpdated 后 renderFlow 调用次数(期望0):', D.afterAuto, '| refreshFlow 后调用次数(期望>=1):', D.afterManual);
  console.log('JS errors:', errors.length, errors.slice(0,3));

  const ok = A.hasTime && A.hasFmt && !A.hasReal && B && C.includes('上次刷新') && D.afterAuto===0 && D.afterManual>=1 && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ 左卡时间标注 + 手动刷新 + 自动链路摘除均正常' : 'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
