// 验证 loadKlineP（行业/机会模块共用入口）是否把行业ETF写入 state.kcache 并打 _date
// —— 这是“518880/515050 停在旧交易日”的根因补漏点：此前 loadKlineP 不写 kcache，行业ETF从未进入跨日刷新网络。
// 用 Node vm 单 context 执行真实模块代码（避免 jsdom 逐个 script 注入时 let/const/函数声明不跨脚本共享的怪癖）。
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const ORDER=['config.js','utils.js','kline.js','quotes.js','sectors.js'];

// 受控时钟：今天固定为 2026-08-11（避免 Node 真实日期干扰 _date 断言）
function makeFakeDate(){ const R=Date; function F(...a){ return a.length? new R(...a): new R('2026-08-11T10:30:00+08:00'); } F.now=()=>new R('2026-08-11T10:30:00+08:00').getTime(); F.prototype=R.prototype; return F; }
let pass=0, fail=0;
function check(n,ok,ex){ if(ok){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+'  '+(ex||''));} }

const ctx={ console, setTimeout, clearTimeout, TextDecoder, Date: makeFakeDate(), fetch:()=>Promise.reject(new Error('no-net')) };
ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);

let srcAll=ORDER.map(f=>fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n;\n');
srcAll+='\n;globalThis.__APP={loadKlineP,state,normCode,INDUSTRY_POOL,loadKline,adjustSplits};';
try{ vm.runInContext(srcAll, ctx, {filename:'bundle.js'}); }catch(e){ console.log('BUNDLE ERR:', e.message); process.exit(1); }
const A=ctx.__APP;
if(!A||typeof A.loadKlineP!=='function'){ console.log('FAIL: 模块未正确加载'); process.exit(1); }

// mock loadKline（真实腾讯接口在沙箱被 WAF 拦，这里用受控样本替代，专注验证“写 kcache”动作）
const sample=[
  {date:'2026-08-09',open:100,high:101,low:99,close:100,vol:1e6},
  {date:'2026-08-10',open:100,high:102,low:99,close:101,vol:1e6},
  {date:'2026-08-11',open:101,high:103,low:100,close:102,vol:1e6}
];
ctx.loadKline=(code,period,cb,opt)=>{ if(opt&&opt.tailOnly) cb([sample[2]],false); else cb(sample,false); };

(async()=>{
  // H1-H3：行业ETF经 loadKlineP(无前缀码)写入 kcache 并打 _date（518880/515050 同款）
  await A.loadKlineP('515050','d');
  const kc=A.state.kcache['sh515050d'];
  check('H1 loadKlineP 将行业ETF(无前缀码)写入 kcache', !!kc, 'kcache[sh515050d]='+(kc?'存在':'缺失'));
  check('H2 写入缓存带 _date=最新bar日期(8/11)', kc&&kc._date==='2026-08-11', '_date='+(kc&&kc._date));
  check('H3 缓存含完整K线(3根)', kc&&kc.length===3, 'len='+(kc&&kc.length));

  // H4：带前缀代码同样处理
  await A.loadKlineP('sh518880','d');
  const kc2=A.state.kcache['sh518880d'];
  check('H4 带前缀代码(sh518880)同样写入并打 _date=最新bar日期', kc2&&kc2._date==='2026-08-11', 'sh518880d='+(kc2&&kc2._date));

  // H5：已有更完整缓存(更长)时不被覆盖（避免行业模块把详情页已补全历史的K线截短为640根）
  A.state.kcache['sz159915d']=[{date:'2026-01-01',close:1},{date:'2026-08-10',close:2},{date:'2026-08-11',close:3}];
  const before=A.state.kcache['sz159915d'].length;
  await A.loadKlineP('sz159915','d');
  const kc3=A.state.kcache['sz159915d'];
  check('H5 已有更完整缓存不被覆盖(长度保留)', kc3&&kc3.length===before&&kc3._date==='2026-08-11', 'len='+(kc3&&kc3.length)+' before='+before);

  console.log('\n==== loadKlineP 写缓存验收 ====');
  console.log((fail===0?'🎉 全部通过 ('+pass+'/'+(pass+fail)+')':'⚠️ 有失败 ('+fail+' 失败)')+'\n');
  process.exit(fail===0?0:1);
})();
