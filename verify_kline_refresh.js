/* =========================================================================
 * verify_kline_refresh.js —— “除选中股外，其余K线停在上一交易日”修复验收
 * 根因：旧版 refreshSelectedKline 只刷「选中」一只；其余标的K线缓存停在批量
 *       拉取那一刻（那天 11 日数据还没出 → 停在 10 日），且 renderDetail 命中
 *       旧缓存直接画、不再拉取 → 永远停在 10 日。
 * 修复：refreshKlinesToToday() 遍历 kcache 所有标的、把停在旧日的补刷到今天；
 *       renderDetail 命中旧日缓存时也后台 refreshOneKline。
 * 验证：受控时钟(2026-08-11) + mock loadKline(tailOnly 只回当日根)，断言所有
 *       旧日缓存被补到今天、当日根已并入、已是今天的条目/演示数据不被误改。
 * 用法：node verify_kline_refresh.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
// 仅加载刷新链路必需的模块，避免 app.js 自触发干扰断言
const ORDER = ['config.js', 'utils.js', 'demo.js', 'calibrator.js', 'kline.js', 'quotes.js'];

let pass = true; const log = [];
function check(name, cond, detail){ if(cond) log.push('✅ '+name+(detail?' · '+detail:'')); else { pass=false; log.push('❌ '+name+(detail?' · '+detail:'')); } }

// ★ 受控时钟：让 app 内部所有 new Date()/Date.now() 都返回 2026-08-11T07:00:00Z
// （=北京时间 15:00，非交易时段；toISOString 切片=2026-08-11，统一“今天”）
const FIXED = Date.UTC(2026, 7, 11, 7, 0, 0);
class FakeDate extends Date {
  constructor(...a){ if(a.length===0) super(FIXED); else super(...a); }
  static now(){ return FIXED; }
}

// 构造一根 bar（带 date + OHLC）
function bar(date, close){ return { date, open:close-1, close, high:close+1, low:close-2, vol:100 }; }

(async()=>{
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: '+(e.detail||e.message||e)));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\s*<script src="js\//.test(l)).join('\n'),
    { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'file://'+ROOT+'/' });
  const { window } = dom;

  // 注入受控时钟（必须在加载业务脚本之前）
  window.Date = FakeDate;

  for(const f of ORDER){ const s=window.document.createElement('script'); s.textContent=fs.readFileSync(path.join(ROOT,'js',f),'utf8'); window.document.body.appendChild(s); }
  if(errors.length){ check('模块加载无错', false, errors.slice(0,2).join(';')); }

  // mock loadKline：必须在模块加载“之后”覆盖，否则 function 声明会把 mock 冲掉。
  // tailOnly 只回“当日根”，其余返回空（不影响本测试）
  window.loadKline = (code, period, cb, opt) => {
    if(opt && opt.tailOnly) cb([ bar('2026-08-11', 100) ], false);
    else cb([], false);
  };

  // 通过 window.eval 操作 state（config.js 用 let 声明，不挂 window）
  const ev = (code) => window.eval(code);
  const seed = {
    selected: null,
    hold: [],
    watch: [
      {code:'sh600519', kind:'stock'},
      {code:'sz000001', kind:'stock'},
      {code:'sh600000', kind:'stock'},
      {code:'sh601318', kind:'stock'}
    ],
    kcache: {
      'sh600519d': [ bar('2026-08-08',97), bar('2026-08-09',98), bar('2026-08-10',99) ],
      'sz000001d': [ bar('2026-08-09',50), bar('2026-08-10',51) ],
      'sh600000w': [ bar('2026-07-31',20), bar('2026-08-07',21) ],
      'sh601318d': [ bar('2026-08-10',200), bar('2026-08-11',202) ],
      'sz159919d': [ bar('2026-08-10',10) ]
    }
  };
  ev('state.selected = '+JSON.stringify(seed.selected)+';');
  ev('state.watch = '+JSON.stringify(seed.watch)+';');
  ev('state.kcache = '+JSON.stringify(seed.kcache)+';');
  // 数组上附加的 _date/_demo 不会被 JSON 序列化，单独赋值
  ev("state.kcache['sh600519d']._date='2026-08-10';");
  ev("state.kcache['sz000001d']._date='2026-08-10';");
  ev("state.kcache['sh600000w']._date='2026-08-07';");
  ev("state.kcache['sh601318d']._date='2026-08-11';");
  ev("state.kcache['sz159919d']._date='2026-08-10'; state.kcache['sz159919d']._demo=true;");

  // 调用修复后的统一刷新
  ev('refreshKlinesToToday()');
  await new Promise(r=>setTimeout(r, 1600));   // 2 批(BATCH=4,GAP=120)+处理余量

  const k = (c) => ev(`state.kcache['${c}']`);
  const lastDate = (arr) => arr && arr.length ? arr[arr.length-1].date : null;

  // A：两只日线旧缓存(10日)都被补到 11日
  const k1 = k('sh600519d'), k2 = k('sz000001d');
  check('A1 茅台日线补刷到 8/11', lastDate(k1)==='2026-08-11' && k1._date==='2026-08-11', '末日='+lastDate(k1)+' _date='+k1._date);
  check('A2 平安日线补刷到 8/11', lastDate(k2)==='2026-08-11' && k2._date==='2026-08-11', '末日='+lastDate(k2)+' _date='+k2._date);
  check('A3 当日根已并入缓存(长度+1)', k1.length===4 && k2.length===3, '茅台len='+k1.length+' 平安len='+k2.length);

  // B：周线旧缓存也被补（正则 [dw]$ 命中 w）
  const kw = k('sh600000w');
  check('B1 周线旧缓存补刷到 8/11', lastDate(kw)==='2026-08-11' && kw._date==='2026-08-11', '末日='+lastDate(kw)+' _date='+kw._date);

  // C：已是今天的条目不被误改
  const kc = k('sh601318d');
  check('C1 已是 8/11 的标的未被改动', lastDate(kc)==='2026-08-11' && kc.length===2 && kc._date==='2026-08-11', '末日='+lastDate(kc)+' len='+kc.length);

  // D：演示数据(_demo)跳过、不动缓存
  const kd = k('sz159919d');
  check('D1 演示K线不被误刷(_demo 跳过)', kd._demo===true && kd.length===1 && lastDate(kd)==='2026-08-10', '末日='+lastDate(kd)+' len='+kd.length+' demo='+kd._demo);

  // E：综合——刷新后所有“旧日”标的的 _date 都已对齐到今天（一句话确认修复生效）
  const staleCodes = ['sh600519d','sz000001d','sh600000w'];
  const allToday = staleCodes.every(c => { const a=k(c); return a && a._date==='2026-08-11' && lastDate(a)==='2026-08-11'; });
  check('E1 所有旧日K线(日/周)均已补刷到 8/11', allToday, 'codes='+staleCodes.join(','));

  console.log('\n==== K线跨日补刷验收 ====');
  log.forEach(l=>console.log(l));
  console.log('\n'+(pass?'🎉 全部通过':'⛔ 存在 FAIL'));
  process.exit(pass?0:1);
})();
