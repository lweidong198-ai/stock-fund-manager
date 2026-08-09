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
  // puppeteer cache
  const base = process.env.USERPROFILE + '\\.cache\\puppeteer';
  if(fs.existsSync(base)){
    const ws = require('child_process').execSync('where /r "'+base+'" chrome.exe 2>nul').toString().trim().split('\n')[0];
    if(ws) return ws;
  }
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

  // 注入：自选 + 选中茅台；给茅台一个真实结构的 quotes（腾讯内外盘+五档）；mock 东财 loadFundFlow 返回真实结构
  await page.evaluate(()=>{
    window.loadFundFlow = function(code, cb){ // mock 真实东财结构：茅台今日主力净流出1.16亿；f57主力净占比在p[6]
      cb({ main:-116062619, mainPct:-2.53, raw:['2026-08-07 15:00','-116062619','-252554','116315180','-108712639','-7349980','-2.53'] });
    };
    state.watch = [
      {code:'sh600519', kind:'stock', name:'贵州茅台'},
      {code:'sz000001', kind:'stock', name:'平安银行'}
    ];
    state.selected = 'sh600519';
    state.quotes['sh600519'] = {
      code:'sh600519', name:'贵州茅台', price:1480, changePct:-1.2,
      outer:350000, inner:520000,
      bid:[[1480,100],[1479,200],[1478,150],[1477,300],[1476,250]],
      ask:[[1481,120],[1482,180],[1483,160],[1484,220],[1485,140]]
    };
    state.quotes['sz000001'] = { code:'sz000001', name:'平安银行', price:11.5, changePct:0.3, outer:800000, inner:600000, bid:[[11.5,500]], ask:[[11.51,400]] };
  });

  await page.evaluate(()=>{ goView('flow'); });
  await new Promise(r=>setTimeout(r,400)); // 等异步 loadFundFlow mock

  const res = await page.evaluate(()=>{
    const card = document.getElementById('flowMainCard');
    const sel = document.getElementById('flowSel');
    const list = document.getElementById('flowList');
    return {
      card: card ? card.innerText : 'NO_CARD',
      selHasActiveBuy: sel ? sel.innerText.includes('主动买') : false,
      selHasMain: sel ? sel.innerText.includes('主力资金净流入') : false,
      listRows: list ? (list.querySelectorAll('tbody tr')||[]).length : 0,
      listText: list ? list.innerText.slice(0,80) : ''
    };
  });

  console.log('flowMainCard =', JSON.stringify(res.card));
  console.log('sel含"主动买"(腾讯内外盘) =', res.selHasActiveBuy);
  console.log('sel含"主力资金净流入"(东财) =', res.selHasMain);
  console.log('列表行数 =', res.listRows);
  console.log('列表预览 =', JSON.stringify(res.listText));
  console.log('JS errors =', errors.length, errors.slice(0,3));

  const ok = res.card.includes('-1.16') && res.card.includes('亿') && res.selHasActiveBuy && res.selHasMain && res.listRows>=2 && errors.length===0;
  console.log('\nVERDICT: ' + (ok ? 'PASS ✓ 资金流向模块渲染正确(东财真实主力净流入-1.16亿 + 腾讯内外盘 + 列表)' : 'FAIL ✗'));
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
