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

  // 校验清单：无重复 code + 数量从15增至33
  const meta = await page.evaluate(()=>{
    const codes = DC_VAL_UNIVERSE.map(x=>x.c);
    return { total: codes.length, unique: new Set(codes).size, hasDup: codes.length!==new Set(codes).size };
  });

  // mock：ensureDataReady 立刻灌入假K线(每标的不同当前价→分位各异)，避免联网
  await page.evaluate(()=>{
    window.ensureDataReady = function(code, kind){
      const n=600; const arr=[];
      // 用 code 末位决定当前价在序列中的位置，制造不同分位
      const seed = parseInt(code.slice(-1),10);
      for(let i=0;i<n;i++){ arr.push({close: 100 + Math.sin(i/12)*25 + i*(seed/100)}); }
      state.kcache[code+'d'] = arr;
      return Promise.resolve(true);
    };
    dcRunVal();
  });
  await new Promise(r=>setTimeout(r,600));

  const res = await page.evaluate(()=>{
    const body = document.getElementById('dcValBody');
    const txt = body ? body.innerText : '';
    const rows = body ? body.querySelectorAll('table.dc tbody tr').length : 0;
    const expectNames = ['券商ETF','保险ETF','房地产ETF','有色金属ETF','煤炭ETF','钢铁ETF','化工ETF','农业ETF','传媒ETF','通信ETF','计算机ETF','电力ETF','汽车ETF','家电ETF','食品饮料ETF','创新药ETF','红利ETF','中证1000ETF','稀土ETF'];
    const missing = expectNames.filter(nm=>!txt.includes(nm));
    return { txtLen: txt.length, rows, missing };
  });

  console.log('=== 清单校验 ===');
  console.log('总数:', meta.total, '| 去重后:', meta.unique, '| 有重复?', meta.hasDup);
  console.log('=== 渲染校验 ===');
  console.log('表格行数:', res.rows, '| 缺失新行业:', JSON.stringify(res.missing));
  console.log('JS errors:', errors.length, errors.slice(0,3));

  const ok = !meta.hasDup && meta.total===34 && res.rows===34 && res.missing.length===0 && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ 估值温度计行业扩至34个, 全部渲染无重复无报错' : 'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
