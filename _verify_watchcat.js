const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
function findChrome(){
  const roots = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'];
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
  page.on('dialog', async d=>{ if(d.type()==='prompt') await d.accept('科技'); else await d.accept(); });
  await page.goto(FILE, {waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,400));

  // 1) 干净初始化：默认分类 + 两只自选
  await page.evaluate(()=>{
    state.watchCats=[{id:'def',name:'默认'}];
    state.watchCat='all';
    state.watch=[{code:'sh600519',kind:'stock',cat:'def'},{code:'sz000858',kind:'stock',cat:'def'}];
    save(); renderWatch();
  });
  const chips1 = await page.evaluate(()=>[...document.querySelectorAll('#watchCats .tg')].map(x=>x.innerText.trim()));
  const hasDef = chips1.some(t=>t.includes('默认')) && chips1.some(t=>t==='全部') && chips1.some(t=>t.includes('＋'));

  // 2) 新建分类「科技」
  await page.evaluate(()=>{ document.querySelector('#watchCats [data-addcat]').click(); });
  await new Promise(r=>setTimeout(r,150));
  const afterAdd = await page.evaluate(()=>({
    cats: state.watchCats.map(c=>c.name),
    cur: state.watchCat,
    curIsTech: state.watchCats.some(c=>c.name==='科技' && c.id===state.watchCat)
  }));

  // 3) 把第一只自选(贵州茅台)切到「科技」分类
  await page.evaluate(()=>{ state.watchCat='all'; renderWatch(); }); // 新分类会自动选中导致列表空, 先切回全部让下拉可见
  await new Promise(r=>setTimeout(r,120));
  await page.evaluate(()=>{
    const techId = state.watchCats.find(c=>c.name==='科技').id;
    const sel = document.querySelector('select.wl-cat[data-code="sh600519"]');
    sel.value = techId;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await new Promise(r=>setTimeout(r,120));
  const afterAssign = await page.evaluate(()=>{
    const techId = state.watchCats.find(c=>c.name==='科技').id;
    return {
      maotaiCat: (state.watch.find(w=>w.code==='sh600519')||{}).cat,
      techId
    };
  });

  // 4) 点「科技」分类 → 只显示茅台
  await page.evaluate(()=>{ document.querySelector('#watchCats .wc-chip[data-cat="'+state.watchCats.find(c=>c.name==='科技').id+'"]').click(); });
  await new Promise(r=>setTimeout(r,120));
  const filtered = await page.evaluate(()=>({
    rows:[...document.querySelectorAll('#watchBox tr[data-code]')].map(r=>r.dataset.code),
    cur: state.watchCat
  }));

  // 5) 删除「科技」分类 → 茅台回到默认，分类消失
  await page.evaluate(()=>{ const techId=state.watchCats.find(c=>c.name==='科技').id; document.querySelector('#watchCats .wc-x[data-delcat="'+techId+'"]').click(); });
  await new Promise(r=>setTimeout(r,150));
  const afterDel = await page.evaluate(()=>({
    cats: state.watchCats.map(c=>c.name),
    maotaiCat: (state.watch.find(w=>w.code==='sh600519')||{}).cat
  }));

  // 6) 持久化校验：save 后 localStorage 含分类
  const persisted = await page.evaluate(()=>{
    try{ const o=JSON.parse(localStorage.getItem('sfm_watch_cats_v1')); return o && Array.isArray(o.cats); }catch(e){ return false; }
  });

  await browser.close();

  const checks = {
    '分类条含 全部/默认/＋': hasDef,
    '新建分类科技成功': afterAdd.cats.includes('科技') && afterAdd.curIsTech,
    '自选切换分类生效': afterAssign.maotaiCat===afterAssign.techId,
    '点分类仅显示该分类项': filtered.rows.length===1 && filtered.rows[0]==='sh600519',
    '删除分类->移回默认且分类消失': !afterDel.cats.includes('科技') && afterDel.maotaiCat==='def',
    '分类已持久化': persisted,
    '无JS错误': errors.length===0
  };
  console.log('检查项:');
  for(const k in checks) console.log('  '+(checks[k]?'✓':'✗')+' '+k);
  if(errors.length) console.log('错误:', errors);
  const ok = Object.values(checks).every(Boolean);
  console.log('\nVERDICT:', ok?'PASS ✓ 自选自定义分类功能正常':'FAIL ✗');
  process.exit(ok?0:1);
})().catch(e=>{ console.error('RUNNER ERROR', e); process.exit(2); });
